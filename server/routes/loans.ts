import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { loans, users, repayments, smartContracts, gigEarnings } from "../../shared/schema.js";
import { eq, desc, and } from "drizzle-orm";
import {
  generateContractHash,
  createLoanBlockchain,
  isUsingRealBlockchain,
} from "../utils/blockchain.js";
import { getAuthPayload } from "../middleware/auth.js";
import { logAudit } from "../utils/audit.js";

const router = Router();

router.post("/apply", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { amount, tenure, purpose } = req.body;

    if (!amount || !tenure) {
      return res.status(400).json({ error: "Amount and tenure are required" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, auth.userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.isKycVerified) {
      return res.status(400).json({ error: "KYC verification required before applying for a loan" });
    }

    const loanAmount = parseFloat(amount);
    const loanTenure = parseInt(tenure);
    let interestRate: number;

    if ((user.creditScore || 500) >= 750) interestRate = 8;
    else if ((user.creditScore || 500) >= 600) interestRate = 12;
    else interestRate = 18;

    if ((user.reputationScore || 0) >= 90) interestRate -= 2;
    else if ((user.reputationScore || 0) >= 80) interestRate -= 1;
    interestRate = Math.max(6, interestRate);

    const userEarnings = await db.select().from(gigEarnings).where(eq(gigEarnings.userId, auth.userId));
    const totalEarningsSum = userEarnings.reduce((sum, e) => sum + e.amount, 0);
    const earningMonths = new Set(userEarnings.map(e => {
      const d = new Date(e.earnedAt);
      return `${d.getFullYear()}-${d.getMonth()}`;
    }));
    const earningMonthCount = Math.max(earningMonths.size, 1);
    const monthlyAvgEarnings = totalEarningsSum / earningMonthCount;

    let maxLoanAmount: number;
    if ((user.creditScore || 500) >= 750) maxLoanAmount = 50000;
    else if ((user.creditScore || 500) >= 600) maxLoanAmount = 25000;
    else maxLoanAmount = 10000;
    const earningsCap = monthlyAvgEarnings * 3;
    if (earningsCap > 0 && earningsCap < maxLoanAmount) {
      maxLoanAmount = Math.floor(earningsCap);
    }

    if (loanAmount > maxLoanAmount) {
      return res.status(400).json({ error: `Requested amount exceeds maximum eligible loan amount of ₹${maxLoanAmount.toLocaleString("en-IN")}` });
    }

    if (loanAmount < 15000) {
      interestRate = 0;
    }
    const interestAmount = loanAmount >= 15000 ? (loanAmount * interestRate * loanTenure) / (100 * 12) : 0;
    const totalDue = loanAmount + interestAmount;
    const monthlyEmi = loanAmount >= 15000 ? totalDue / loanTenure : 0;

    const contractData = {
      borrower: user.email,
      amount: loanAmount,
      interestRate,
      tenure: loanTenure,
      totalDue,
      timestamp: new Date().toISOString(),
    };
    const contractHash = generateContractHash(contractData);

    const [loan] = await db.insert(loans).values({
      userId: auth.userId,
      amount: loanAmount,
      interestRate,
      tenure: loanTenure,
      purpose: purpose || null,
      status: "pending",
      totalDue,
      monthlyEmi,
      contractHash,
      nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    const blockchainResult = await createLoanBlockchain(
      loan.id,
      user.email,
      loanAmount,
      interestRate,
      loanTenure,
      totalDue
    );

    await db.update(loans).set({
      blockchainTxId: blockchainResult.txHash,
    }).where(eq(loans.id, loan.id));

    await db.insert(smartContracts).values({
      loanId: loan.id,
      contractAddress: blockchainResult.contractAddress,
      borrower: user.email,
      amount: loanAmount,
      interestRate,
      tenure: loanTenure,
      status: "created",
      contractHash,
      blockNumber: blockchainResult.blockNumber,
      events: JSON.stringify([blockchainResult.event]),
    });

    await logAudit({
      userId: auth.userId,
      action: "loan_applied",
      entity: "loan",
      entityId: loan.id,
      details: {
        borrowerUserId: auth.userId,
        amount: loanAmount,
        tenure: loanTenure,
        interestRate,
        maxEligibleAmount: maxLoanAmount,
        monthlyAverageEarnings: Math.round(monthlyAvgEarnings),
      },
    });

    res.status(201).json({
      loan: { ...loan, blockchainTxId: blockchainResult.txHash },
      contract: {
        address: blockchainResult.contractAddress,
        hash: contractHash,
        blockNumber: blockchainResult.blockNumber,
        txHash: blockchainResult.txHash,
        etherscanTxUrl: blockchainResult.etherscanTxUrl,
        etherscanContractUrl: blockchainResult.etherscanContractUrl,
        onChain: blockchainResult.onChain,
      },
      blockchainMode: isUsingRealBlockchain() ? "ethereum_sepolia" : "simulation",
    });
  } catch (error) {
    console.error("Loan application error:", error);
    res.status(500).json({ error: "Failed to apply for loan" });
  }
});

router.get("/my", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const userLoans = await db.select().from(loans)
      .where(eq(loans.userId, auth.userId))
      .orderBy(desc(loans.createdAt));

    res.json(userLoans);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch loans" });
  }
});

router.get("/:loanId", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const loanId = parseInt(req.params.loanId);
    const [loan] = await db.select().from(loans).where(eq(loans.id, loanId));
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    if (loan.userId !== auth.userId && auth.role !== "admin") {
      return res.status(403).json({ error: "Not authorized to view this loan" });
    }

    const [contract] = await db.select().from(smartContracts).where(eq(smartContracts.loanId, loanId));
    const loanRepayments = await db.select().from(repayments)
      .where(eq(repayments.loanId, loanId))
      .orderBy(desc(repayments.paidAt));

    res.json({
      loan,
      contract,
      repayments: loanRepayments,
      blockchainMode: isUsingRealBlockchain() ? "ethereum_sepolia" : "simulation",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch loan details" });
  }
});

export default router;
