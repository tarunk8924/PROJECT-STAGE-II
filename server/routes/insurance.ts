import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { insurancePool, loans } from "../../shared/schema.js";
import { eq, desc, sql } from "drizzle-orm";
import { getAuthPayload } from "../middleware/auth.js";

const router = Router();

router.get("/balance", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const allEntries = await db.select().from(insurancePool);

    const balance = allEntries.reduce((sum, entry) => {
      if (entry.type === "contribution") return sum + entry.amount;
      if (entry.type === "claim") return sum - entry.amount;
      return sum;
    }, 0);

    res.json({ balance: Math.round(balance * 100) / 100 });
  } catch (error) {
    console.error("Insurance balance error:", error);
    res.status(500).json({ error: "Failed to fetch pool balance" });
  }
});

router.get("/history", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const history = await db.select().from(insurancePool).orderBy(desc(insurancePool.createdAt));

    res.json(history);
  } catch (error) {
    console.error("Insurance history error:", error);
    res.status(500).json({ error: "Failed to fetch pool history" });
  }
});

router.post("/contribute/:loanId", async (req: Request, res: Response) => {
  try {
    const loanId = parseInt(req.params.loanId);

    const [loan] = await db.select().from(loans).where(eq(loans.id, loanId));
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    const contributionAmount = Math.round(loan.amount * 0.02 * 100) / 100;

    const allEntries = await db.select().from(insurancePool);
    const currentBalance = allEntries.reduce((sum, entry) => {
      if (entry.type === "contribution") return sum + entry.amount;
      if (entry.type === "claim") return sum - entry.amount;
      return sum;
    }, 0);

    const [entry] = await db.insert(insurancePool).values({
      loanId,
      type: "contribution",
      amount: contributionAmount,
      balance: Math.round((currentBalance + contributionAmount) * 100) / 100,
      description: `Auto-contribution of 2% from loan #${loanId} (₹${loan.amount})`,
    }).returning();

    res.status(201).json({ message: "Insurance contribution recorded", entry });
  } catch (error) {
    console.error("Insurance contribution error:", error);
    res.status(500).json({ error: "Failed to record contribution" });
  }
});

router.post("/claim/:loanId", async (req: Request, res: Response) => {
  try {
    const loanId = parseInt(req.params.loanId);

    const [loan] = await db.select().from(loans).where(eq(loans.id, loanId));
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    if (loan.status !== "defaulted") {
      return res.status(400).json({ error: "Claims can only be made for defaulted loans" });
    }

    const allEntries = await db.select().from(insurancePool);
    const currentBalance = allEntries.reduce((sum, entry) => {
      if (entry.type === "contribution") return sum + entry.amount;
      if (entry.type === "claim") return sum - entry.amount;
      return sum;
    }, 0);

    const maxClaim = loan.amount * 0.5;
    const claimAmount = Math.round(Math.min(currentBalance, maxClaim) * 100) / 100;

    if (claimAmount <= 0) {
      return res.status(400).json({ error: "Insufficient pool balance for claim" });
    }

    const [entry] = await db.insert(insurancePool).values({
      loanId,
      type: "claim",
      amount: claimAmount,
      balance: Math.round((currentBalance - claimAmount) * 100) / 100,
      description: `Insurance claim for defaulted loan #${loanId} (50% of ₹${loan.amount})`,
    }).returning();

    res.status(201).json({ message: "Insurance claim processed", entry, claimAmount });
  } catch (error) {
    console.error("Insurance claim error:", error);
    res.status(500).json({ error: "Failed to process claim" });
  }
});

export default router;
