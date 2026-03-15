import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { emiSchedules, loans } from "../../shared/schema.js";
import { eq, and, lt } from "drizzle-orm";
import { getAuthPayload } from "../middleware/auth.js";
import { authenticateToken, requireAdmin } from "./auth.js";

const router = Router();

router.post("/generate/:loanId", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const auth = (req as any).auth;
    const loanId = parseInt(req.params.loanId);

    const [loan] = await db.select().from(loans).where(eq(loans.id, loanId));
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    if (loan.status !== "active") {
      return res.status(400).json({ error: "Can only generate EMI schedule for active loans" });
    }

    if (parseFloat(String(loan.amount)) < 15000) {
      return res.status(400).json({ error: "EMI schedule is not applicable for loans under ₹15,000. Borrower pays the full amount by the due date." });
    }

    const existing = await db.select().from(emiSchedules).where(eq(emiSchedules.loanId, loanId));
    if (existing.length > 0) {
      return res.status(400).json({ error: "EMI schedule already exists for this loan" });
    }

    const startDate = loan.approvedAt ? new Date(loan.approvedAt) : new Date();
    const entries = [];

    for (let i = 1; i <= loan.tenure; i++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      entries.push({
        loanId: loan.id,
        userId: loan.userId,
        dueDate,
        amount: loan.monthlyEmi,
        status: "upcoming",
      });
    }

    const created = await db.insert(emiSchedules).values(entries).returning();

    res.status(201).json({ message: "EMI schedule generated", schedule: created });
  } catch (error) {
    console.error("EMI generation error:", error);
    res.status(500).json({ error: "Failed to generate EMI schedule" });
  }
});

router.get("/schedule/:loanId", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const loanId = parseInt(req.params.loanId);

    const [loan] = await db.select().from(loans).where(eq(loans.id, loanId));
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    if (loan.userId !== auth.userId && auth.role !== "admin") {
      return res.status(403).json({ error: "Not authorized to view this schedule" });
    }

    const schedule = await db.select().from(emiSchedules).where(eq(emiSchedules.loanId, loanId));

    res.json(schedule);
  } catch (error) {
    console.error("EMI schedule fetch error:", error);
    res.status(500).json({ error: "Failed to fetch EMI schedule" });
  }
});

router.post("/remind", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const now = new Date();

    const overdueEmis = await db.select().from(emiSchedules).where(
      and(
        eq(emiSchedules.status, "upcoming"),
        lt(emiSchedules.dueDate, now)
      )
    );

    const updated = [];
    for (const emi of overdueEmis) {
      const [updatedEmi] = await db.update(emiSchedules)
        .set({ status: "overdue", reminderSentAt: now })
        .where(eq(emiSchedules.id, emi.id))
        .returning();
      updated.push(updatedEmi);
      console.log(`Reminder: EMI #${emi.id} for loan #${emi.loanId} is overdue (due: ${emi.dueDate})`);
    }

    res.json({ message: "Reminder check completed", overdueCount: updated.length, overdueEmis: updated });
  } catch (error) {
    console.error("EMI reminder error:", error);
    res.status(500).json({ error: "Failed to process reminders" });
  }
});

export default router;
