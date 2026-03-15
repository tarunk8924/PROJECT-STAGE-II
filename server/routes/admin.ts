import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { users, loans, repayments, smartContracts, kycRecords, gigEarnings, transactions, auditLogs, wallets, kycDocuments, gigPlatformConnections } from "../../shared/schema.js";
import { eq, desc, sql, count, and } from "drizzle-orm";
import {
  approveLoanBlockchain,
  rejectLoanBlockchain,
  isUsingRealBlockchain,
  createContractEvent,
  createOnChainEvent,
} from "../utils/blockchain.js";
import { getAuthPayload } from "../middleware/auth.js";
import { checkAndMarkDefaults } from "../utils/defaultDetection.js";
import { logAudit } from "../utils/audit.js";

function parseMetrics(raw?: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const router = Router();

router.get("/stats", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const allUsers = await db.select().from(users);
    const allLoans = await db.select().from(loans);
    const allRepayments = await db.select().from(repayments);
    const allKycRecords = await db.select().from(kycRecords);

    const totalUsers = allUsers.filter(u => u.role === "user").length;
    const kycVerified = allUsers.filter(u => u.isKycVerified).length;
    const totalLoans = allLoans.length;
    const pendingLoans = allLoans.filter(l => l.status === "pending").length;
    const pendingKycReviews = allKycRecords.filter(k => k.status === "under_review").length;
    const activeLoans = allLoans.filter(l => l.status === "active").length;
    const completedLoans = allLoans.filter(l => l.status === "completed").length;
    const defaultedLoans = allLoans.filter(l => l.status === "defaulted").length;
    const totalDisbursed = allLoans.filter(l => ["active", "completed"].includes(l.status))
      .reduce((sum, l) => sum + l.amount, 0);
    const totalRepaid = allRepayments.reduce((sum, r) => sum + r.amount, 0);
    const avgCreditScore = allUsers.filter(u => u.role === "user").length > 0
      ? Math.round(allUsers.filter(u => u.role === "user")
          .reduce((sum, u) => sum + (u.creditScore || 500), 0) / totalUsers)
      : 0;

    res.json({
      totalUsers,
      kycVerified,
      totalLoans,
      pendingLoans,
      pendingKycReviews,
      activeLoans,
      completedLoans,
      defaultedLoans,
      totalDisbursed,
      totalRepaid,
      avgCreditScore,
      blockchainMode: isUsingRealBlockchain() ? "ethereum_sepolia" : "simulation",
    });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/users", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const allUsers = await db.select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      phone: users.phone,
      role: users.role,
      creditScore: users.creditScore,
      riskTier: users.riskTier,
      reputationScore: users.reputationScore,
      walletBalance: users.walletBalance,
      isKycVerified: users.isKycVerified,
      createdAt: users.createdAt,
    }).from(users).orderBy(desc(users.createdAt));

    res.json(allUsers);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/loans", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const allLoans = await db.select().from(loans).orderBy(desc(loans.createdAt));

    const enrichedLoans = await Promise.all(
      allLoans.map(async (loan) => {
        const [user] = await db.select({
          email: users.email,
          fullName: users.fullName,
          creditScore: users.creditScore,
          riskTier: users.riskTier,
        }).from(users).where(eq(users.id, loan.userId));
        const [kyc] = await db.select().from(kycRecords).where(eq(kycRecords.userId, loan.userId)).orderBy(desc(kycRecords.createdAt)).limit(1);
        const userRepayments = await db.select().from(repayments).where(eq(repayments.userId, loan.userId));
        const userWallets = await db.select().from(wallets).where(eq(wallets.userId, loan.userId));
        const evidenceRows = await db.select().from(gigPlatformConnections)
          .where(and(eq(gigPlatformConnections.userId, loan.userId), eq(gigPlatformConnections.status, "connected")));
        const screenshotEvidence = evidenceRows.map((row) => parseMetrics(row.extractedMetrics)).find((metrics) => metrics?.source === "screenshot_ocr");
        const evidenceReview = screenshotEvidence?.review || null;
        const onTimeRepayments = userRepayments.filter((repayment) => repayment.isOnTime).length;
        const lateRepayments = userRepayments.length - onTimeRepayments;

        return {
          ...loan,
          user,
          reviewState: loan.status === "pending" ? "under_review" : loan.status === "rejected" ? "rejected" : "conditionally_approved",
          riskSummary: {
            kycStatus: kyc?.status || "pending",
            bankVerified: userWallets.some((wallet) => wallet.type === "bank" && wallet.isVerified),
            earningsEvidenceStatus: evidenceReview?.status || (screenshotEvidence ? "under_review" : "pending"),
            repaymentOnTime: onTimeRepayments,
            repaymentLate: lateRepayments,
            aiGeneratedSuspected: !!evidenceReview?.aiGeneratedSuspected,
            manipulatedSuspected: !!evidenceReview?.manipulatedSuspected,
          },
          riskNotes: [
            kyc?.status === "verified" ? "KYC approved" : `KYC status is ${kyc?.status || "pending"}`,
            userWallets.some((wallet) => wallet.type === "bank" && wallet.isVerified) ? "Verified bank account available" : "No verified bank account",
            evidenceReview?.status ? `Earnings evidence review is ${evidenceReview.status}` : screenshotEvidence ? "Earnings evidence is awaiting manual review" : "No earnings evidence reviewed yet",
            userRepayments.length > 0 ? `${onTimeRepayments}/${userRepayments.length} repayments marked on time` : "No repayment history yet",
            evidenceReview?.aiGeneratedSuspected ? "Possible AI-generated screenshot flagged" : null,
            evidenceReview?.manipulatedSuspected ? "Possible screenshot manipulation flagged" : null,
          ].filter(Boolean),
        };
      })
    );

    res.json(enrichedLoans);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch loans" });
  }
});

router.get("/analytics", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const allLoans = await db.select().from(loans);
    const allRepayments = await db.select().from(repayments);
    const allKycRecords = await db.select().from(kycRecords);

    const disbursementsByMonth: Record<string, number> = {};
    allLoans.filter(l => l.approvedAt && ["active", "completed"].includes(l.status)).forEach(loan => {
      const d = new Date(loan.approvedAt!);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      disbursementsByMonth[key] = (disbursementsByMonth[key] || 0) + loan.amount;
    });

    const repaymentsByMonth: Record<string, number> = {};
    allRepayments.forEach(r => {
      const d = new Date(r.paidAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      repaymentsByMonth[key] = (repaymentsByMonth[key] || 0) + r.amount;
    });

    const allMonths = [...new Set([...Object.keys(disbursementsByMonth), ...Object.keys(repaymentsByMonth)])].sort();
    const monthlyDisbursements = allMonths.map(m => ({ month: m, amount: disbursementsByMonth[m] || 0 }));
    const monthlyRepayments = allMonths.map(m => ({ month: m, amount: repaymentsByMonth[m] || 0 }));

    const totalDisbursed = allLoans.filter(l => ["active", "completed"].includes(l.status)).reduce((s, l) => s + l.amount, 0);
    const totalRepaid = allRepayments.reduce((s, r) => s + r.amount, 0);
    const repaymentRate = totalDisbursed > 0 ? Math.round((totalRepaid / totalDisbursed) * 10000) / 100 : 0;

    const totalLoans = allLoans.length;
    const defaultedLoans = allLoans.filter(l => l.status === "defaulted").length;
    const defaultRate = totalLoans > 0 ? Math.round((defaultedLoans / totalLoans) * 10000) / 100 : 0;

    res.json({ monthlyDisbursements, monthlyRepayments, repaymentRate, defaultRate });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

router.get("/contracts", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const allContracts = await db.select().from(smartContracts).orderBy(desc(smartContracts.createdAt));

    const enriched = await Promise.all(
      allContracts.map(async (contract) => {
        const [loan] = await db.select().from(loans).where(eq(loans.id, contract.loanId));
        let user = null;
        if (loan) {
          const [u] = await db.select({ email: users.email, fullName: users.fullName }).from(users).where(eq(users.id, loan.userId));
          user = u;
        }
        return { ...contract, loan, user };
      })
    );

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch contracts" });
  }
});

router.get("/audit-logs", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);

    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

router.get("/earnings-evidence/pending", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const rows = await db.select({
      id: gigPlatformConnections.id,
      userId: gigPlatformConnections.userId,
      platform: gigPlatformConnections.platform,
      platformUsername: gigPlatformConnections.platformUsername,
      profileUrl: gigPlatformConnections.profileUrl,
      extractedMetrics: gigPlatformConnections.extractedMetrics,
      connectedAt: gigPlatformConnections.connectedAt,
      fullName: users.fullName,
      email: users.email,
    }).from(gigPlatformConnections)
      .innerJoin(users, eq(users.id, gigPlatformConnections.userId))
      .where(eq(gigPlatformConnections.status, "connected"))
      .orderBy(desc(gigPlatformConnections.connectedAt));

    const evidence = rows
      .map((row) => {
        const metrics = parseMetrics(row.extractedMetrics);
        if (!metrics || metrics.source !== "screenshot_ocr") return null;
        return {
          id: row.id,
          userId: row.userId,
          platform: row.platform,
          platformUsername: row.platformUsername,
          profileUrl: row.profileUrl,
          fullName: row.fullName,
          email: row.email,
          connectedAt: row.connectedAt,
          metrics,
          review: metrics.review || { status: "under_review" },
        };
      })
      .filter(Boolean);

    res.json(evidence);
  } catch (error) {
    console.error("Pending earnings evidence error:", error);
    res.status(500).json({ error: "Failed to fetch earnings evidence queue" });
  }
});

router.get("/kyc/pending", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const pending = await db.select({
      id: kycRecords.id,
      userId: kycRecords.userId,
      fullName: kycRecords.fullName,
      idType: kycRecords.idType,
      idNumber: kycRecords.idNumber,
      dateOfBirth: kycRecords.dateOfBirth,
      address: kycRecords.address,
      status: kycRecords.status,
      verificationMethod: kycRecords.verificationMethod,
      createdAt: kycRecords.createdAt,
      email: users.email,
      phone: users.phone,
    }).from(kycRecords)
      .innerJoin(users, eq(users.id, kycRecords.userId))
      .where(eq(kycRecords.status, "under_review"))
      .orderBy(desc(kycRecords.createdAt));

    res.json(pending);
  } catch (error) {
    console.error("Pending KYC error:", error);
    res.status(500).json({ error: "Failed to fetch pending KYC reviews" });
  }
});

router.get("/kyc/:kycId/documents", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const kycId = parseInt(req.params.kycId as string);
    const [record] = await db.select().from(kycRecords).where(eq(kycRecords.id, kycId));
    if (!record) return res.status(404).json({ error: "KYC record not found" });

    const docs = await db.select({
      id: kycDocuments.id,
      docType: kycDocuments.docType,
      fileName: kycDocuments.fileName,
      fileData: kycDocuments.fileData,
      status: kycDocuments.status,
      uploadedAt: kycDocuments.uploadedAt,
    }).from(kycDocuments)
      .where(eq(kycDocuments.userId, record.userId))
      .orderBy(desc(kycDocuments.uploadedAt));

    res.json(docs);
  } catch (error) {
    console.error("KYC document review error:", error);
    res.status(500).json({ error: "Failed to fetch KYC documents" });
  }
});

router.post("/kyc/:kycId/approve", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const kycId = parseInt(req.params.kycId as string);
    const [record] = await db.select().from(kycRecords).where(eq(kycRecords.id, kycId));
    if (!record) return res.status(404).json({ error: "KYC record not found" });

    await db.update(kycRecords).set({ status: "verified", verifiedAt: new Date() }).where(eq(kycRecords.id, kycId));
    await db.update(users).set({ isKycVerified: true }).where(eq(users.id, record.userId));

    await logAudit({
      userId: auth.userId,
      action: "kyc_approved",
      entity: "kyc_record",
      entityId: kycId,
      details: { reviewedUserId: record.userId },
    });

    res.json({ message: "KYC approved successfully" });
  } catch (error) {
    console.error("Approve KYC error:", error);
    res.status(500).json({ error: "Failed to approve KYC" });
  }
});

router.post("/kyc/:kycId/reject", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const kycId = parseInt(req.params.kycId as string);
    const [record] = await db.select().from(kycRecords).where(eq(kycRecords.id, kycId));
    if (!record) return res.status(404).json({ error: "KYC record not found" });

    const reason = req.body?.reason || "Rejected during manual review";
    await db.update(kycRecords)
      .set({ status: "rejected", verificationMethod: `${record.verificationMethod || "manual"}:rejected` })
      .where(eq(kycRecords.id, kycId));
    await db.update(users).set({ isKycVerified: false }).where(eq(users.id, record.userId));

    await logAudit({
      userId: auth.userId,
      action: "kyc_rejected",
      entity: "kyc_record",
      entityId: kycId,
      details: { reviewedUserId: record.userId, reason },
    });

    res.json({ message: "KYC rejected", reason });
  } catch (error) {
    console.error("Reject KYC error:", error);
    res.status(500).json({ error: "Failed to reject KYC" });
  }
});

router.post("/earnings-evidence/:connectionId/review", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const connectionId = parseInt(req.params.connectionId as string);
    const { decision, reason } = req.body || {};
    if (!["conditionally_approved", "rejected", "under_review"].includes(decision)) {
      return res.status(400).json({ error: "decision must be one of: under_review, conditionally_approved, rejected" });
    }

    const [connection] = await db.select().from(gigPlatformConnections).where(eq(gigPlatformConnections.id, connectionId));
    if (!connection) return res.status(404).json({ error: "Evidence record not found" });

    const metrics = parseMetrics(connection.extractedMetrics);
    if (!metrics || metrics.source !== "screenshot_ocr") {
      return res.status(400).json({ error: "Only screenshot OCR evidence can be reviewed here" });
    }

    const review = {
      ...(metrics.review || {}),
      status: decision,
      decisionReason: reason || null,
      decidedAt: new Date().toISOString(),
      decidedBy: auth.userId,
      aiGeneratedSuspected: !!(metrics.review?.aiGeneratedSuspected ?? metrics.aiGeneratedSuspected),
      manipulatedSuspected: !!(metrics.review?.manipulatedSuspected ?? metrics.manipulatedSuspected),
    };

    await db.update(gigPlatformConnections)
      .set({ extractedMetrics: JSON.stringify({ ...metrics, review }) })
      .where(eq(gigPlatformConnections.id, connectionId));

    await logAudit({
      userId: auth.userId,
      action: "earnings_evidence_reviewed",
      entity: "gig_platform_connection",
      entityId: connectionId,
      details: {
        reviewedUserId: connection.userId,
        decision,
        reason: reason || null,
        aiGeneratedSuspected: review.aiGeneratedSuspected,
        manipulatedSuspected: review.manipulatedSuspected,
      },
    });

    res.json({ message: `Earnings evidence marked as ${decision.replace(/_/g, " ")}`, review });
  } catch (error) {
    console.error("Review earnings evidence error:", error);
    res.status(500).json({ error: "Failed to review earnings evidence" });
  }
});

router.post("/check-defaults", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const result = await checkAndMarkDefaults();
    res.json({ message: "Default check completed", ...result });
  } catch (error) {
    console.error("Check defaults error:", error);
    res.status(500).json({ error: "Failed to check defaults" });
  }
});

router.post("/loans/:loanId/approve", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const loanId = parseInt(req.params.loanId);
    const [loan] = await db.select().from(loans).where(eq(loans.id, loanId));
    if (!loan) return res.status(404).json({ error: "Loan not found" });
    if (loan.status !== "pending") {
      return res.status(400).json({ error: "Only pending loans can be approved" });
    }

    const userWallets = await db.select().from(wallets).where(
      and(eq(wallets.userId, loan.userId), eq(wallets.isVerified, true))
    );
    if (userWallets.length === 0) {
      return res.status(400).json({ error: "Borrower has no verified wallet for disbursement" });
    }
    const primaryWallet = userWallets.find(w => w.isPrimary) || userWallets[0];

    const blockchainResult = await approveLoanBlockchain(loanId, auth.userId, loan.amount);

    await db.update(loans).set({
      status: "active",
      approvedBy: auth.userId,
      approvedAt: new Date(),
      disbursedAt: new Date(),
      blockchainTxId: blockchainResult.txHash,
    }).where(eq(loans.id, loanId));

    await db.update(users).set({
      walletBalance: sql`${users.walletBalance} + ${loan.amount}`,
    }).where(eq(users.id, loan.userId));

    await db.insert(transactions).values({
      userId: loan.userId,
      loanId,
      walletId: primaryWallet.id,
      type: "disbursement",
      amount: loan.amount,
      status: "completed",
      paymentMethod: primaryWallet.type,
      txHash: blockchainResult.txHash,
      completedAt: new Date(),
    });

    await logAudit({
      userId: auth.userId,
      action: "loan_approved_and_disbursed",
      entity: "loan",
      entityId: loanId,
      details: {
        borrowerUserId: loan.userId,
        amount: loan.amount,
        walletId: primaryWallet.id,
        txHash: blockchainResult.txHash,
        onChain: blockchainResult.onChain,
      },
    });

    const disburseEvent = blockchainResult.onChain
      ? createOnChainEvent("LoanDisbursed", blockchainResult.txHash, blockchainResult.blockNumber, {
          loanId, amount: loan.amount, walletId: primaryWallet.id, paymentMethod: primaryWallet.type,
        })
      : createContractEvent("LoanDisbursed", {
          loanId, amount: loan.amount, walletId: primaryWallet.id, paymentMethod: primaryWallet.type,
        });

    const [contract] = await db.select().from(smartContracts).where(eq(smartContracts.loanId, loanId));
    if (contract) {
      const events = JSON.parse(contract.events || "[]");
      events.push(blockchainResult.event, disburseEvent);
      await db.update(smartContracts).set({
        status: "active",
        events: JSON.stringify(events),
        updatedAt: new Date(),
      }).where(eq(smartContracts.loanId, loanId));
    }

    res.json({
      message: "Loan approved and disbursed",
      txHash: blockchainResult.txHash,
      disbursedTo: { walletType: primaryWallet.type, walletId: primaryWallet.id },
      blockchain: {
        approveEvent: blockchainResult.event,
        disburseEvent,
        onChain: blockchainResult.onChain,
        etherscanTxUrl: blockchainResult.etherscanTxUrl,
      },
    });
  } catch (error) {
    console.error("Loan approval error:", error);
    res.status(500).json({ error: "Failed to approve loan" });
  }
});

router.post("/loans/:loanId/reject", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const loanId = parseInt(req.params.loanId);
    const { reason } = req.body;

    const [loan] = await db.select().from(loans).where(eq(loans.id, loanId));
    if (!loan) return res.status(404).json({ error: "Loan not found" });
    if (loan.status !== "pending") {
      return res.status(400).json({ error: "Only pending loans can be rejected" });
    }

    await db.update(loans).set({ status: "rejected" }).where(eq(loans.id, loanId));

    const blockchainResult = await rejectLoanBlockchain(loanId, reason || "Not approved");

    await logAudit({
      userId: auth.userId,
      action: "loan_rejected",
      entity: "loan",
      entityId: loanId,
      details: {
        borrowerUserId: loan.userId,
        reason: reason || "Not approved",
        txHash: blockchainResult.txHash,
        onChain: blockchainResult.onChain,
      },
    });

    const [contract] = await db.select().from(smartContracts).where(eq(smartContracts.loanId, loanId));
    if (contract) {
      const events = JSON.parse(contract.events || "[]");
      events.push(blockchainResult.event);
      await db.update(smartContracts).set({
        status: "rejected",
        events: JSON.stringify(events),
        updatedAt: new Date(),
      }).where(eq(smartContracts.loanId, loanId));
    }

    res.json({
      message: "Loan rejected",
      blockchain: {
        event: blockchainResult.event,
        onChain: blockchainResult.onChain,
        etherscanTxUrl: blockchainResult.etherscanTxUrl,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to reject loan" });
  }
});

export default router;
