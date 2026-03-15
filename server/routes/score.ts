import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { users, gigEarnings, loans, repayments, creditScoreHistory, wallets, gigPlatformConnections } from "../../shared/schema.js";
import { eq, desc, and } from "drizzle-orm";
import { calculateCreditScoreAI, type CreditInput } from "../utils/creditScoring.js";
import { getAuthPayload } from "../middleware/auth.js";

const router = Router();

router.get("/:userId", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const requesterId = auth.userId;

    const targetUserId = parseInt(req.params.userId);

    if (requesterId !== targetUserId && auth.role !== "admin") {
      return res.status(403).json({ error: "You can only access your own credit score" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, targetUserId));
    if (!user) return res.status(404).json({ error: "User not found" });

    const earnings = await db.select().from(gigEarnings).where(eq(gigEarnings.userId, targetUserId));
    const totalEarnings = earnings.reduce((sum, e) => sum + e.amount, 0);

    const months = new Set(earnings.map(e => {
      const d = new Date(e.earnedAt);
      return `${d.getFullYear()}-${d.getMonth()}`;
    }));
    const monthCount = Math.max(months.size, 1);
    const monthlyAvgEarnings = totalEarnings / monthCount;

    const earningsByMonth = new Map<string, number>();
    earnings.forEach(e => {
      const d = new Date(e.earnedAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      earningsByMonth.set(key, (earningsByMonth.get(key) || 0) + e.amount);
    });
    const monthlyAmounts = Array.from(earningsByMonth.values());
    const earningConsistency = monthlyAmounts.length > 1
      ? 1 - (standardDeviation(monthlyAmounts) / (Math.max(...monthlyAmounts) || 1))
      : 0.5;

    const userLoans = await db.select().from(loans).where(eq(loans.userId, targetUserId));
    const totalLoans = userLoans.length;
    const loansRepaid = userLoans.filter(l => l.status === "completed").length;
    const loanDefaulted = userLoans.filter(l => l.status === "defaulted").length;

    const allRepayments = await db.select().from(repayments).where(eq(repayments.userId, targetUserId));
    const onTimePayments = allRepayments.filter(r => r.isOnTime).length;
    const latePayments = allRepayments.filter(r => !r.isOnTime).length;

    const accountAgeDays = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));

    const userWallets = await db.select().from(wallets).where(eq(wallets.userId, targetUserId));
    const hasVerifiedUpi = userWallets.some(w => w.type === "upi" && w.isVerified);

    const connections = await db.select().from(gigPlatformConnections).where(
      and(eq(gigPlatformConnections.userId, targetUserId), eq(gigPlatformConnections.status, "connected"))
    );
    const connectedPlatformCount = connections.length;

    let platformRating = 0;
    let platformCompletedJobs = 0;
    let platformJobSuccessScore = 0;
    let metricsCount = 0;

    for (const conn of connections) {
      if (conn.extractedMetrics) {
        try {
          const metrics = typeof conn.extractedMetrics === 'string'
            ? JSON.parse(conn.extractedMetrics)
            : conn.extractedMetrics;
          if (metrics.rating) { platformRating += metrics.rating; metricsCount++; }
          if (metrics.completedJobs) platformCompletedJobs += metrics.completedJobs;
          if (metrics.jobSuccessScore) platformJobSuccessScore = Math.max(platformJobSuccessScore, metrics.jobSuccessScore);
        } catch {}
      }
    }
    if (metricsCount > 0) platformRating = platformRating / metricsCount;

    const monthsWithEarnings = months.size;
    const totalMonthsTracked = Math.max(1, Math.ceil(accountAgeDays / 30));

    const creditInput: CreditInput = {
      totalEarnings,
      monthlyAvgEarnings,
      earningConsistency: Math.max(0, Math.min(1, earningConsistency)),
      totalLoans,
      loansRepaid,
      loanDefaulted,
      onTimePayments,
      latePayments,
      reputationScore: user.reputationScore ?? 0,
      accountAgeDays,
      isKycVerified: user.isKycVerified || false,
      platformRating,
      platformCompletedJobs,
      platformJobSuccessScore,
      hasVerifiedUpi,
      connectedPlatformCount,
      monthsWithEarnings,
      totalMonthsTracked,
    };

    const result = await calculateCreditScoreAI(creditInput);

    await db.update(users).set({
      creditScore: result.score,
      riskTier: result.riskTier,
    }).where(eq(users.id, targetUserId));

    if (result.score > 0) {
      await db.insert(creditScoreHistory).values({
        userId: targetUserId,
        score: result.score,
        riskTier: result.riskTier,
        factors: JSON.stringify(result.factors),
      });
    }

    res.json({
      userId: targetUserId,
      creditScore: result.score,
      riskTier: result.riskTier,
      factors: result.factors,
      factorBreakdown: result.factorBreakdown,
      recommendedLoanAmount: result.recommendedLoanAmount,
      recommendedInterestRate: result.recommendedInterestRate,
      approvalProbability: result.approvalProbability,
      input: creditInput,
    });
  } catch (error) {
    console.error("Credit score error:", error);
    res.status(500).json({ error: "Failed to calculate credit score" });
  }
});

router.get("/:userId/history", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const targetUserId = parseInt(req.params.userId);

    if (auth.userId !== targetUserId && auth.role !== "admin") {
      return res.status(403).json({ error: "You can only access your own credit score history" });
    }

    const history = await db.select().from(creditScoreHistory)
      .where(eq(creditScoreHistory.userId, targetUserId))
      .orderBy(desc(creditScoreHistory.calculatedAt));

    res.json(history);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch credit history" });
  }
});

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map(v => Math.pow(v - avg, 2));
  return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
}

export default router;
