import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { p2pFunding, loans, users } from "../../shared/schema.js";
import { eq, desc, sql } from "drizzle-orm";
import { getAuthPayload } from "../middleware/auth.js";

const router = Router();

router.get("/available", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const pendingLoans = await db.select().from(loans).where(eq(loans.status, "pending")).orderBy(desc(loans.createdAt));

    res.json(pendingLoans);
  } catch (error) {
    console.error("P2P available error:", error);
    res.status(500).json({ error: "Failed to fetch available loans" });
  }
});

router.post("/fund/:loanId", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const loanId = parseInt(req.params.loanId);
    const { amount } = req.body;

    if (!amount || isNaN(parseFloat(amount))) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, auth.userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    if ((user.reputationScore || 0) < 70) {
      return res.status(403).json({ error: "Reputation score must be at least 70 to fund loans" });
    }

    const [loan] = await db.select().from(loans).where(eq(loans.id, loanId));
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    if (loan.status !== "pending") {
      return res.status(400).json({ error: "Only pending loans can be funded" });
    }

    if (loan.userId === auth.userId) {
      return res.status(400).json({ error: "Cannot fund your own loan" });
    }

    const fundAmount = parseFloat(amount);
    const interestReturn = fundAmount + (fundAmount * loan.interestRate * loan.tenure) / (100 * 12);

    const [funding] = await db.insert(p2pFunding).values({
      loanId,
      lenderId: auth.userId,
      amount: fundAmount,
      status: "committed",
      returnAmount: Math.round(interestReturn * 100) / 100,
    }).returning();

    res.status(201).json({ message: "Loan funded successfully", funding });
  } catch (error) {
    console.error("P2P fund error:", error);
    res.status(500).json({ error: "Failed to fund loan" });
  }
});

router.get("/my-investments", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const investments = await db.select().from(p2pFunding)
      .where(eq(p2pFunding.lenderId, auth.userId))
      .orderBy(desc(p2pFunding.createdAt));

    res.json(investments);
  } catch (error) {
    console.error("P2P investments error:", error);
    res.status(500).json({ error: "Failed to fetch investments" });
  }
});

router.get("/pool-stats", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const allFunding = await db.select().from(p2pFunding);

    const totalFunded = allFunding.reduce((sum, f) => sum + f.amount, 0);
    const totalExpectedReturns = allFunding.reduce((sum, f) => sum + (f.returnAmount || 0), 0);
    const totalInvestors = new Set(allFunding.map(f => f.lenderId)).size;
    const totalLoansFinanced = new Set(allFunding.map(f => f.loanId)).size;

    res.json({
      totalFunded: Math.round(totalFunded * 100) / 100,
      totalExpectedReturns: Math.round(totalExpectedReturns * 100) / 100,
      totalInvestors,
      totalLoansFinanced,
      totalTransactions: allFunding.length,
    });
  } catch (error) {
    console.error("P2P pool stats error:", error);
    res.status(500).json({ error: "Failed to fetch pool stats" });
  }
});

export default router;
