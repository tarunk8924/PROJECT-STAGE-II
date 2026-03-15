import { and, desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import { auditLogs, gigPlatformConnections, kycRecords, loans, repayments, users, wallets } from "../../shared/schema.js";
import { parseAuditDetails } from "./audit.js";

function parseMetrics(raw?: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mapActionLabel(action: string) {
  const labels: Record<string, string> = {
    user_registered: "Account created",
    kyc_submitted: "KYC submitted",
    kyc_resubmitted: "KYC resubmitted",
    kyc_approved: "KYC approved",
    kyc_rejected: "KYC rejected",
    upwork_profile_verified: "Upwork profile verified",
    earnings_evidence_submitted: "Earnings evidence submitted",
    earnings_evidence_reviewed: "Earnings evidence reviewed",
    earnings_synced: "Earnings synced",
    loan_applied: "Loan application submitted",
    loan_approved_and_disbursed: "Loan approved and disbursed",
    loan_rejected: "Loan rejected",
    repayment_made: "Repayment made",
  };
  return labels[action] || action.replace(/_/g, " ");
}

export async function getBorrowerTrustSummary(userId: number) {
  const [[user], [kyc], walletRows, connectionRows, userLoans, userRepayments, logs] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)),
    db.select().from(kycRecords).where(eq(kycRecords.userId, userId)).orderBy(desc(kycRecords.createdAt)).limit(1),
    db.select().from(wallets).where(eq(wallets.userId, userId)),
    db.select().from(gigPlatformConnections).where(and(eq(gigPlatformConnections.userId, userId), eq(gigPlatformConnections.status, "connected"))),
    db.select().from(loans).where(eq(loans.userId, userId)),
    db.select().from(repayments).where(eq(repayments.userId, userId)),
    db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200),
  ]);

  const relatedLogs = logs.filter((log) => {
    const details = parseAuditDetails(log.details);
    return log.userId === userId || details?.reviewedUserId === userId || details?.borrowerUserId === userId;
  });

  const latestKycRejection = relatedLogs.find((log) => log.action === "kyc_rejected");
  const latestKycRejectionReason = parseAuditDetails(latestKycRejection?.details)?.reason || null;

  const metricsRows = connectionRows.map((row) => ({ row, metrics: parseMetrics(row.extractedMetrics) }));
  const profileVerified = metricsRows.some(({ metrics }) => !!metrics?.profileUrl || metrics?.source === "public_profile" || metrics?.source === "sample_catalog");
  const earningsEvidence = metricsRows.find(({ metrics }) => metrics?.source === "screenshot_ocr")?.metrics || null;
  const earningsReview = earningsEvidence?.review || null;
  const bankVerified = walletRows.some((wallet) => wallet.type === "bank" && wallet.isVerified);

  const onTimeRepayments = userRepayments.filter((repayment) => repayment.isOnTime).length;
  const lateRepayments = userRepayments.length - onTimeRepayments;

  return {
    phoneVerified: !!user?.phone,
    bankVerified,
    kycReviewed: !!kyc && ["under_review", "verified", "rejected", "conditionally_approved"].includes(kyc.status || ""),
    kycStatus: kyc?.status || "pending",
    kycRejectionReason: latestKycRejectionReason,
    profileVerified,
    earningsEvidenceReviewed: !!earningsReview,
    earningsEvidenceStatus: earningsReview?.status || (earningsEvidence ? "under_review" : "pending"),
    earningsEvidenceFlags: {
      aiGeneratedSuspected: !!earningsReview?.aiGeneratedSuspected,
      manipulatedSuspected: !!earningsReview?.manipulatedSuspected,
    },
    verifiedBankCount: walletRows.filter((wallet) => wallet.type === "bank" && wallet.isVerified).length,
    activeLoanCount: userLoans.filter((loan) => ["pending", "active"].includes(loan.status)).length,
    completedLoanCount: userLoans.filter((loan) => loan.status === "completed").length,
    repaymentSummary: {
      total: userRepayments.length,
      onTime: onTimeRepayments,
      late: lateRepayments,
    },
  };
}

export async function getUserTimeline(userId: number) {
  const [[user], logs] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)),
    db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(250),
  ]);

  const relatedLogs = logs.filter((log) => {
    const details = parseAuditDetails(log.details);
    return log.userId === userId || details?.reviewedUserId === userId || details?.borrowerUserId === userId;
  });

  const events = relatedLogs.map((log) => ({
    id: `audit-${log.id}`,
    createdAt: log.createdAt,
    action: log.action,
    label: mapActionLabel(log.action),
    details: parseAuditDetails(log.details),
  }));

  if (user?.createdAt) {
    events.push({
      id: `signup-${user.id}`,
      createdAt: user.createdAt,
      action: "user_registered",
      label: "Account created",
      details: null,
    });
  }

  return events
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 25);
}
