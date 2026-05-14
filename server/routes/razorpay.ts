import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { razorpayPayments, transactions, auditLogs, loans, repayments, users, smartContracts, wallets } from "../../shared/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { getAuthPayload } from "../middleware/auth.js";
import crypto from "crypto";
import {
  recordRepaymentBlockchain,
  createOnChainEvent,
  createContractEvent,
} from "../utils/blockchain.js";

const router = Router();

let razorpayInstance: any = null;

async function getRazorpayInstance() {
  if (razorpayInstance) return razorpayInstance;

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return null;
  }

  try {
    const RazorpayModule = await import("razorpay");
    const Razorpay = RazorpayModule.default || RazorpayModule;
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
    return razorpayInstance;
  } catch (error) {
    console.error("Failed to initialize Razorpay:", error);
    return null;
  }
}

router.get("/config", (_req: Request, res: Response) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  res.json({
    configured: !!keyId && !!process.env.RAZORPAY_KEY_SECRET,
    keyId: keyId || null,
  });
});

router.post("/create-order", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { amount, currency = "INR", description, loanId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    const razorpay = await getRazorpayInstance();
    if (!razorpay) {
      return res.status(503).json({ error: "Razorpay is not configured. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET." });
    }

    const receipt = `rcpt_${Date.now()}_${auth.userId}`;
    const amountInPaise = Math.round(amount * 100);

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency,
      receipt,
      notes: {
        userId: auth.userId.toString(),
        loanId: loanId ? loanId.toString() : "",
        description: description || "Payment via MicroCredit",
      },
    });

    const [payment] = await db.insert(razorpayPayments).values({
      userId: auth.userId,
      orderId: order.id,
      amount,
      currency,
      status: "created",
      description: description || "Payment via MicroCredit",
      loanId: loanId || null,
      receipt,
    }).returning();

    await db.insert(auditLogs).values({
      userId: auth.userId,
      action: "razorpay_order_created",
      entity: "razorpay_payment",
      entityId: payment.id,
      details: JSON.stringify({ orderId: order.id, amount, currency }),
    });

    res.json({
      orderId: order.id,
      amount: amountInPaise,
      currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      paymentRecordId: payment.id,
    });
  } catch (error: any) {
    console.error("Razorpay create order error:", error);
    res.status(500).json({ error: error.message || "Failed to create Razorpay order" });
  }
});

router.post("/verify", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment verification details" });
    }

    const [existingRecord] = await db.select().from(razorpayPayments)
      .where(and(
        eq(razorpayPayments.orderId, razorpay_order_id),
        eq(razorpayPayments.userId, auth.userId)
      ));

    if (!existingRecord) {
      return res.status(404).json({ error: "Payment order not found or does not belong to you" });
    }

    if (existingRecord.status === "paid") {
      return res.status(400).json({ error: "Payment already verified" });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return res.status(503).json({ error: "Razorpay not configured" });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(body)
      .digest("hex");

    const isValid = expectedSignature === razorpay_signature;

    if (!isValid) {
      await db.update(razorpayPayments)
        .set({
          status: "failed",
          errorDescription: "Signature verification failed",
        })
        .where(and(
          eq(razorpayPayments.orderId, razorpay_order_id),
          eq(razorpayPayments.userId, auth.userId)
        ));

      return res.status(400).json({ error: "Payment verification failed - invalid signature" });
    }

    const razorpay = await getRazorpayInstance();
    let paymentDetails: any = {};
    if (razorpay) {
      try {
        paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
      } catch (e) {
        console.error("Failed to fetch payment details:", e);
      }
    }

    await db.update(razorpayPayments)
      .set({
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
        status: "paid",
        method: paymentDetails.method || "unknown",
        paidAt: new Date(),
      })
      .where(and(
        eq(razorpayPayments.orderId, razorpay_order_id),
        eq(razorpayPayments.userId, auth.userId)
      ));

    if (existingRecord.loanId) {
      const [loan] = await db.select().from(loans).where(eq(loans.id, existingRecord.loanId));

      if (loan && loan.userId === auth.userId && loan.status === "active") {
        const remaining = loan.totalDue - (loan.amountRepaid || 0);
        const actualPayment = Math.min(existingRecord.amount, remaining);

        if (actualPayment > 0) {
          const isOnTime = loan.nextDueDate ? new Date() <= new Date(loan.nextDueDate) : true;
          const newAmountRepaid = (loan.amountRepaid || 0) + actualPayment;
          const isFullyRepaid = newAmountRepaid >= loan.totalDue;

          const blockchainResult = await recordRepaymentBlockchain(
            loan.id,
            actualPayment,
            newAmountRepaid,
            isOnTime
          );

          await db.insert(repayments).values({
            loanId: loan.id,
            userId: auth.userId,
            amount: actualPayment,
            isOnTime,
            transactionHash: blockchainResult.txHash,
          });

          const [primaryWallet] = await db.select().from(wallets).where(
            and(
              eq(wallets.userId, auth.userId),
              eq(wallets.isVerified, true),
              eq(wallets.isPrimary, true)
            )
          );

          await db.insert(transactions).values({
            userId: auth.userId,
            loanId: loan.id,
            walletId: primaryWallet?.id,
            type: "repayment",
            amount: actualPayment,
            status: "completed",
            paymentMethod: paymentDetails.method || "razorpay",
            reference: razorpay_payment_id,
            txHash: blockchainResult.txHash,
            completedAt: new Date(),
          });

          await db.update(loans).set({
            amountRepaid: newAmountRepaid,
            status: isFullyRepaid ? "completed" : "active",
            completedAt: isFullyRepaid ? new Date() : undefined,
            nextDueDate: isFullyRepaid ? undefined : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          }).where(eq(loans.id, loan.id));

          const [user] = await db.select().from(users).where(eq(users.id, auth.userId));
          let reputationDelta = isOnTime ? 3 : -5;
          if (isFullyRepaid) reputationDelta += 5;

          const newReputation = Math.max(0, Math.min(100, (user?.reputationScore || 50) + reputationDelta));
          await db.update(users).set({ reputationScore: newReputation }).where(eq(users.id, auth.userId));

          const [contract] = await db.select().from(smartContracts).where(eq(smartContracts.loanId, loan.id));
          if (contract) {
            const existingEvents = JSON.parse(contract.events || "[]");
            existingEvents.push(blockchainResult.event);

            if (isFullyRepaid) {
              const completedEvent = blockchainResult.onChain
                ? createOnChainEvent("LoanCompleted", blockchainResult.txHash, blockchainResult.blockNumber, { loanId: loan.id, totalRepaid: newAmountRepaid })
                : createContractEvent("LoanCompleted", { loanId: loan.id, totalRepaid: newAmountRepaid });
              existingEvents.push(completedEvent);
            }

            await db.update(smartContracts).set({
              status: isFullyRepaid ? "completed" : "active",
              events: JSON.stringify(existingEvents),
              updatedAt: new Date(),
            }).where(eq(smartContracts.loanId, loan.id));
          }
        }
      }
    }

    await db.insert(transactions).values({
      userId: existingRecord.userId,
      loanId: existingRecord.loanId,
      type: "razorpay_payment",
      amount: existingRecord.amount,
      status: "completed",
      paymentMethod: paymentDetails.method || "razorpay",
      reference: razorpay_payment_id,
      txHash: razorpay_order_id,
    });

    await db.insert(auditLogs).values({
      userId: existingRecord.userId,
      action: "razorpay_payment_verified",
      entity: "razorpay_payment",
      entityId: existingRecord.id,
      details: JSON.stringify({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        amount: existingRecord.amount,
        method: paymentDetails.method,
      }),
    });

    res.json({
      success: true,
      message: "Payment verified successfully",
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      method: paymentDetails.method || "unknown",
    });
  } catch (error: any) {
    console.error("Razorpay verify error:", error);
    res.status(500).json({ error: error.message || "Failed to verify payment" });
  }
});

router.post("/failed", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { orderId, errorCode, errorDescription } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }

    await db.update(razorpayPayments)
      .set({
        status: "failed",
        errorCode: errorCode || "UNKNOWN",
        errorDescription: errorDescription || "Payment failed",
      })
      .where(and(
        eq(razorpayPayments.orderId, orderId),
        eq(razorpayPayments.userId, auth.userId)
      ));

    await db.insert(auditLogs).values({
      userId: auth.userId,
      action: "razorpay_payment_failed",
      entity: "razorpay_payment",
      details: JSON.stringify({ orderId, errorCode, errorDescription }),
    });

    res.json({ message: "Payment failure recorded" });
  } catch (error) {
    res.status(500).json({ error: "Failed to record payment failure" });
  }
});

router.get("/payments", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const payments = await db.select().from(razorpayPayments)
      .where(eq(razorpayPayments.userId, auth.userId))
      .orderBy(desc(razorpayPayments.createdAt));

    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

router.get("/payments/:paymentId", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const razorpay = await getRazorpayInstance();
    if (!razorpay) {
      return res.status(503).json({ error: "Razorpay not configured" });
    }

    const paymentDetails = await razorpay.payments.fetch(req.params.paymentId);
    res.json(paymentDetails);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch payment details" });
  }
});

export default router;
