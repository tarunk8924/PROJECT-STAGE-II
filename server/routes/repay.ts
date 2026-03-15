import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { loans, users, repayments, smartContracts, wallets, transactions, auditLogs } from "../../shared/schema.js";
import { eq, and } from "drizzle-orm";
import {
  recordRepaymentBlockchain,
  createOnChainEvent,
  createContractEvent,
  isUsingRealBlockchain,
} from "../utils/blockchain.js";
import { getAuthPayload } from "../middleware/auth.js";

const router = Router();

router.post("/retry/:transactionId", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const transactionId = parseInt(req.params.transactionId);

    const [transaction] = await db.select().from(transactions).where(
      and(eq(transactions.id, transactionId), eq(transactions.userId, auth.userId))
    );

    if (!transaction) return res.status(404).json({ error: "Transaction not found" });
    if (transaction.status !== "failed") {
      return res.status(400).json({ error: "Only failed transactions can be retried" });
    }

    const newRetryCount = (transaction.retryCount || 0) + 1;
    const success = Math.random() < 0.9;

    if (success) {
      await db.update(transactions).set({
        status: "completed",
        retryCount: newRetryCount,
        completedAt: new Date(),
        failureReason: null,
      }).where(eq(transactions.id, transactionId));

      await db.insert(auditLogs).values({
        userId: auth.userId,
        action: "transaction_retry_success",
        entity: "repayment",
        entityId: transactionId,
        details: JSON.stringify({ retryCount: newRetryCount }),
      });

      res.json({ message: "Transaction retry successful", status: "completed", retryCount: newRetryCount });
    } else {
      await db.update(transactions).set({
        status: "failed",
        retryCount: newRetryCount,
        failureReason: "Payment processing failed on retry",
      }).where(eq(transactions.id, transactionId));

      await db.insert(auditLogs).values({
        userId: auth.userId,
        action: "transaction_retry_failed",
        entity: "repayment",
        entityId: transactionId,
        details: JSON.stringify({ retryCount: newRetryCount }),
      });

      res.json({ message: "Transaction retry failed", status: "failed", retryCount: newRetryCount });
    }
  } catch (error) {
    console.error("Retry error:", error);
    res.status(500).json({ error: "Failed to retry transaction" });
  }
});

router.post("/:loanId", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const loanId = parseInt(req.params.loanId);
    const { amount } = req.body;

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: "Valid payment amount is required" });
    }

    const primaryWallets = await db.select().from(wallets).where(
      and(eq(wallets.userId, auth.userId), eq(wallets.isVerified, true), eq(wallets.isPrimary, true))
    );

    if (primaryWallets.length === 0) {
      return res.status(400).json({ error: "Please connect and verify a wallet before making payments" });
    }

    const primaryWallet = primaryWallets[0];

    const [loan] = await db.select().from(loans).where(eq(loans.id, loanId));
    if (!loan) return res.status(404).json({ error: "Loan not found" });
    if (loan.userId !== auth.userId) return res.status(403).json({ error: "Not your loan" });
    if (loan.status === "completed" || loan.status === "defaulted") {
      return res.status(400).json({ error: "This loan is already closed" });
    }
    if (loan.status !== "active") {
      return res.status(400).json({ error: "Loan must be active to make payments" });
    }

    const paymentAmount = parseFloat(amount);
    const remaining = loan.totalDue - (loan.amountRepaid || 0);
    const actualPayment = Math.min(paymentAmount, remaining);

    const isOnTime = loan.nextDueDate ? new Date() <= new Date(loan.nextDueDate) : true;
    const newAmountRepaid = (loan.amountRepaid || 0) + actualPayment;
    const isFullyRepaid = newAmountRepaid >= loan.totalDue;

    const blockchainResult = await recordRepaymentBlockchain(
      loanId,
      actualPayment,
      newAmountRepaid,
      isOnTime
    );

    const [repayment] = await db.insert(repayments).values({
      loanId,
      userId: auth.userId,
      amount: actualPayment,
      isOnTime,
      transactionHash: blockchainResult.txHash,
    }).returning();

    await db.insert(transactions).values({
      userId: auth.userId,
      loanId,
      walletId: primaryWallet.id,
      type: "repayment",
      amount: actualPayment,
      status: "completed",
      paymentMethod: primaryWallet.type,
      txHash: blockchainResult.txHash,
      completedAt: new Date(),
    });

    await db.update(loans).set({
      amountRepaid: newAmountRepaid,
      status: isFullyRepaid ? "completed" : "active",
      completedAt: isFullyRepaid ? new Date() : undefined,
      nextDueDate: isFullyRepaid ? undefined : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).where(eq(loans.id, loanId));

    const [user] = await db.select().from(users).where(eq(users.id, auth.userId));
    let reputationDelta = 0;
    if (isOnTime) {
      reputationDelta = 3;
    } else {
      reputationDelta = -5;
    }
    if (isFullyRepaid) reputationDelta += 5;

    const newReputation = Math.max(0, Math.min(100, (user?.reputationScore || 50) + reputationDelta));
    await db.update(users).set({ reputationScore: newReputation }).where(eq(users.id, auth.userId));

    const [contract] = await db.select().from(smartContracts).where(eq(smartContracts.loanId, loanId));
    if (contract) {
      const existingEvents = JSON.parse(contract.events || "[]");
      existingEvents.push(blockchainResult.event);

      if (isFullyRepaid) {
        const completedEvent = blockchainResult.onChain
          ? createOnChainEvent("LoanCompleted", blockchainResult.txHash, blockchainResult.blockNumber, { loanId, totalRepaid: newAmountRepaid })
          : createContractEvent("LoanCompleted", { loanId, totalRepaid: newAmountRepaid });
        existingEvents.push(completedEvent);
      }

      await db.update(smartContracts).set({
        status: isFullyRepaid ? "completed" : "active",
        events: JSON.stringify(existingEvents),
        updatedAt: new Date(),
      }).where(eq(smartContracts.loanId, loanId));
    }

    await db.insert(auditLogs).values({
      userId: auth.userId,
      action: "repayment_made",
      entity: "repayment",
      entityId: repayment.id,
      details: JSON.stringify({
        loanId,
        amount: actualPayment,
        isOnTime,
        isFullyRepaid,
        txHash: blockchainResult.txHash,
        onChain: blockchainResult.onChain,
      }),
    });

    res.json({
      repayment,
      loan: {
        amountRepaid: newAmountRepaid,
        remaining: loan.totalDue - newAmountRepaid,
        status: isFullyRepaid ? "completed" : "active",
        isFullyRepaid,
      },
      reputation: { newScore: newReputation, change: reputationDelta },
      blockchain: {
        txHash: blockchainResult.txHash,
        event: blockchainResult.event.event,
        onChain: blockchainResult.onChain,
        etherscanTxUrl: blockchainResult.etherscanTxUrl,
      },
    });
  } catch (error) {
    console.error("Repayment error:", error);
    res.status(500).json({ error: "Failed to process repayment" });
  }
});

export default router;
