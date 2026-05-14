import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { kycRecords, users, kycDocuments, auditLogs } from "../../shared/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { getAuthPayload } from "../middleware/auth.js";
import {
  isSmsConfigured,
  getVerificationMode,
  getOtpProvider,
  getOtpProviderLabel,
  simulateUidaiResponse,
} from "../utils/aadhaarApi.js";
import { isFirebaseConfigured, verifyFirebaseIdToken } from "../utils/firebaseAdmin.js";
import { logAudit, parseAuditDetails } from "../utils/audit.js";

const router = Router();

const VERHOEFF_D_TABLE = [
  [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0]
];
const VERHOEFF_P_TABLE = [
  [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]
];

function normalizeIndianPhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^91/, "");
}

function validateAadhaarFormat(aadhaar: string): { valid: boolean; error?: string } {
  if (!/^\d{12}$/.test(aadhaar)) {
    return { valid: false, error: "Aadhaar number must be exactly 12 digits" };
  }
  if (/^[01]/.test(aadhaar)) {
    return { valid: false, error: "Aadhaar number cannot start with 0 or 1" };
  }
  let c = 0;
  const digits = aadhaar.split("").map(Number).reverse();
  for (let i = 0; i < digits.length; i++) {
    c = VERHOEFF_D_TABLE[c][VERHOEFF_P_TABLE[i % 8][digits[i]]];
  }
  if (c !== 0) {
    return { valid: false, error: "Invalid Aadhaar number (checksum failed). Please check and re-enter." };
  }

  return { valid: true };
}

router.get("/otp-config", (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    res.json({
      provider: getOtpProvider(),
      label: getOtpProviderLabel(),
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to get OTP config" });
  }
});

router.post("/aadhaar/send-otp", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const userId = auth.userId;

    const { aadhaarNumber } = req.body;
    if (!aadhaarNumber) {
      return res.status(400).json({ error: "Aadhaar number is required" });
    }

    if (!isFirebaseConfigured()) {
      return res.status(503).json({ error: "Firebase Phone Auth is not configured" });
    }

    const cleaned = aadhaarNumber.replace(/\s/g, "");
    const validation = validateAadhaarFormat(cleaned);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const providedMobile = req.body.mobileNumber ? normalizeIndianPhone(req.body.mobileNumber) : "";
    const registeredMobile = normalizeIndianPhone(user.phone || (user as any).mobileNumber || providedMobile || "");
    if (!registeredMobile || !/^[6-9]\d{9}$/.test(registeredMobile)) {
      return res.status(400).json({ error: "No valid mobile number found. Please enter your mobile number." });
    }
    if (providedMobile && /^[6-9]\d{9}$/.test(providedMobile) && !user.phone) {
      await db.update(users).set({ phone: providedMobile }).where(eq(users.id, userId));
    }

    const existingKyc = await db.select().from(kycRecords).where(eq(kycRecords.userId, userId));
    if (existingKyc.length > 0 && existingKyc[0].status === "verified") {
      return res.status(400).json({ error: "KYC already verified" });
    }

    const duplicateId = await db.select().from(kycRecords)
      .where(and(eq(kycRecords.idNumber, cleaned), eq(kycRecords.status, "verified")));
    if (duplicateId.length > 0 && duplicateId[0].userId !== userId) {
      return res.status(409).json({ error: "This Aadhaar number is already registered with another user" });
    }

    const provider = getOtpProvider();
    const mode = getVerificationMode();

    const kycData: any = {
      idNumber: cleaned,
      aadhaarOtp: null,
      aadhaarOtpExpiry: null,
      aadhaarClientId: registeredMobile,
      status: "otp_sent",
    };

    if (existingKyc.length > 0) {
      await db.update(kycRecords)
        .set(kycData)
        .where(eq(kycRecords.userId, userId));
    } else {
      await db.insert(kycRecords).values({
        userId,
        idType: "aadhaar",
        fullName: "Pending Verification",
        ...kycData,
        verificationMethod: mode === "live" ? "aadhaar_mobile_otp" : "aadhaar_demo",
      });
    }

    const maskedMobile = `${registeredMobile.slice(0, 2)}******${registeredMobile.slice(-2)}`;
    res.json({
      message: `Aadhaar validated. Firebase OTP will be sent to your registered mobile ${maskedMobile}`,
      maskedAadhaar: `XXXX-XXXX-${cleaned.slice(-4)}`,
      maskedMobile,
      registeredMobile,
      mode,
      provider,
    });
  } catch (error: any) {
    console.error("Aadhaar send OTP error:", error);
    res.status(500).json({ error: error.message || "Failed to validate Aadhaar" });
  }
});

router.post("/aadhaar/verify-otp", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const userId = auth.userId;

    const { aadhaarNumber, firebaseIdToken } = req.body;
    if (!aadhaarNumber) {
      return res.status(400).json({ error: "Aadhaar number is required" });
    }

    if (!firebaseIdToken) {
      return res.status(400).json({ error: "Firebase phone verification is required" });
    }

    const cleaned = aadhaarNumber.replace(/\s/g, "");

    const validation = validateAadhaarFormat(cleaned);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const [kyc] = await db.select().from(kycRecords).where(eq(kycRecords.userId, userId));

    if (!kyc) {
      return res.status(400).json({ error: "No Aadhaar verification in progress. Please request OTP first." });
    }

    if (kyc.status === "verified") {
      return res.status(400).json({ error: "KYC already verified" });
    }

    if (kyc.idNumber !== cleaned) {
      return res.status(400).json({ error: "Aadhaar number does not match the one used to request OTP. Please request a new OTP." });
    }

    const verifiedPhone = await verifyFirebaseIdToken(firebaseIdToken);
    const expectedPhone = normalizeIndianPhone(kyc.aadhaarClientId || "");
    if (!expectedPhone || normalizeIndianPhone(verifiedPhone.phone) !== expectedPhone) {
      return res.status(400).json({ error: "Verified phone number does not match the Aadhaar verification mobile" });
    }

    const provider = getOtpProvider();
    const mode = getVerificationMode();

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const uidaiData = simulateUidaiResponse(cleaned, user?.fullName || undefined);
    const maskedMobile = kyc.aadhaarClientId
      ? `${kyc.aadhaarClientId.slice(0, 2)}******${kyc.aadhaarClientId.slice(-2)}`
      : null;

    await db.update(kycRecords)
      .set({
        status: "verified",
        aadhaarVerified: true,
        aadhaarOtp: null,
        aadhaarOtpExpiry: null,
        fullName: uidaiData.name,
        dateOfBirth: uidaiData.dateOfBirth,
        address: uidaiData.address,
        verificationMethod: mode === "live" ? "aadhaar_mobile_otp" : "aadhaar_demo",
        verifiedAt: new Date(),
      })
      .where(eq(kycRecords.userId, userId));

    await db.update(users).set({ isKycVerified: true, phone: expectedPhone }).where(eq(users.id, userId));

    res.json({
      message: "Aadhaar verification successful",
      status: "verified",
      mode,
      provider,
      uidaiData: {
        name: uidaiData.name,
        dateOfBirth: uidaiData.dateOfBirth,
        gender: uidaiData.gender,
        address: uidaiData.address,
        maskedAadhaar: uidaiData.maskedAadhaar,
        verificationSource: uidaiData.source,
        mobileVerified: maskedMobile,
      },
    });
  } catch (error: any) {
    console.error("Aadhaar verify OTP error:", error);
    res.status(500).json({ error: error.message || "Aadhaar verification failed" });
  }
});

router.post("/verify", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const userId = auth.userId;

    const { idType, idNumber, fullName, dateOfBirth, address } = req.body;

    if (!idType || !idNumber || !fullName) {
      return res.status(400).json({ error: "ID type, ID number, and full name are required" });
    }

    if (idType === "aadhaar") {
      return res.status(400).json({ error: "Aadhaar verification must be done through the real-time verification flow. Use the Aadhaar OTP verification instead." });
    }

    const existingKyc = await db.select().from(kycRecords).where(eq(kycRecords.userId, userId));
    if (existingKyc.length > 0 && existingKyc[0].status === "verified") {
      return res.status(400).json({ error: "KYC already verified" });
    }

    const duplicateId = await db.select().from(kycRecords)
      .where(and(eq(kycRecords.idNumber, idNumber), eq(kycRecords.status, "verified")));
    if (duplicateId.length > 0) {
      return res.status(409).json({ error: "This ID number is already registered with another user" });
    }

    if (existingKyc.length > 0) {
      await db.update(kycRecords)
        .set({ idType, idNumber, fullName, dateOfBirth, address, status: "verified", verifiedAt: new Date(), verificationMethod: "manual" })
        .where(eq(kycRecords.userId, userId));
    } else {
      await db.insert(kycRecords).values({
        userId, idType, idNumber, fullName, dateOfBirth, address,
        status: "verified", verifiedAt: new Date(), verificationMethod: "manual",
      });
    }

    await db.update(users).set({ isKycVerified: true }).where(eq(users.id, userId));

    res.json({ message: "KYC verification completed", status: "verified" });
  } catch (error: any) {
    console.error("KYC verification error:", error);
    res.status(500).json({ error: error.message || "Verification failed" });
  }
});

router.post("/submit-review", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const userId = auth.userId;

    const { idType, idNumber, fullName, dateOfBirth, address, verificationMethod, notes } = req.body;

    if (!idType || !fullName || !idNumber || !dateOfBirth || !address || !verificationMethod) {
      return res.status(400).json({ error: "ID type, full name, ID number, date of birth, address, and verification method are required" });
    }

    const uploadedDocs = await db.select().from(kycDocuments).where(eq(kycDocuments.userId, userId));
    const requiredDocTypes = ["identity_front", "address_proof", "selfie_live"];
    const missing = requiredDocTypes.filter((docType) => !uploadedDocs.some((doc) => doc.docType === docType));
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required KYC artifacts: ${missing.join(", ")}` });
    }

    const existingKyc = await db.select().from(kycRecords).where(eq(kycRecords.userId, userId));
    if (existingKyc.length > 0 && existingKyc[0].status === "verified") {
      return res.status(400).json({ error: "KYC already verified" });
    }

    const payload = {
      idType,
      idNumber,
      fullName,
      dateOfBirth,
      address,
      status: "under_review",
      verificationMethod,
      verifiedAt: null,
      aadhaarVerified: false,
      aadhaarOtp: null,
      aadhaarOtpExpiry: null,
      aadhaarClientId: notes || null,
    } as const;

    if (existingKyc.length > 0) {
      await db.update(kycRecords).set(payload as any).where(eq(kycRecords.userId, userId));
    } else {
      await db.insert(kycRecords).values({ userId, ...payload } as any);
    }

    await db.update(users).set({ isKycVerified: false }).where(eq(users.id, userId));
    await logAudit({
      userId,
      action: existingKyc.length > 0 ? "kyc_resubmitted" : "kyc_submitted",
      entity: "kyc_record",
      entityId: existingKyc[0]?.id ?? null,
      details: {
        idType,
        verificationMethod,
        notes: notes || null,
        status: "under_review",
      },
    });

    res.json({
      message: "KYC documents submitted successfully. Your application is under manual review.",
      status: "under_review",
      verificationMethod,
      uploadedCount: uploadedDocs.length,
    });
  } catch (error: any) {
    console.error("KYC submit review error:", error);
    res.status(500).json({ error: error.message || "Failed to submit KYC review" });
  }
});

router.get("/verification-mode", (_req: Request, res: Response) => {
  const provider = getOtpProvider();
  res.json({
    mode: getVerificationMode(),
    provider: getOtpProviderLabel(),
    otpProvider: provider,
  });
});

router.post("/aadhaar/resend-otp", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const userId = auth.userId;

    const [kyc] = await db.select().from(kycRecords).where(eq(kycRecords.userId, userId));
    if (!kyc || kyc.status === "verified") {
      return res.status(400).json({ error: "No active OTP request found" });
    }

    const mode = getVerificationMode();
    const provider = getOtpProvider();

    res.json({
      message: "OTP can be resent via Firebase Phone Auth",
      mode,
      provider,
      registeredMobile: kyc.aadhaarClientId || "",
    });
  } catch (error: any) {
    console.error("Aadhaar resend OTP error:", error);
    res.status(500).json({ error: error.message || "Failed to resend OTP" });
  }
});

router.get("/status", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const userId = auth.userId;

    const [kyc] = await db.select().from(kycRecords).where(eq(kycRecords.userId, userId));

    if (!kyc) {
      return res.json({ status: "not_started", isVerified: false });
    }

    const reviewLogs = await db.select().from(auditLogs)
      .where(eq(auditLogs.entity, "kyc_record"))
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);
    const relatedReviewLogs = reviewLogs.filter((log) => parseAuditDetails(log.details)?.reviewedUserId === userId);
    const latestRejection = relatedReviewLogs.find((log) => log.action === "kyc_rejected");

    res.json({
      status: kyc.status,
      isVerified: kyc.status === "verified",
      idType: kyc.idType,
      maskedId: kyc.idNumber ? `XXXX-XXXX-${kyc.idNumber.slice(-4)}` : null,
      fullName: kyc.fullName || null,
      verifiedAt: kyc.verifiedAt,
      verificationMethod: kyc.verificationMethod,
      rejectionReason: parseAuditDetails(latestRejection?.details)?.reason || null,
      canResubmit: ["rejected", "under_review"].includes(kyc.status || ""),
    });
  } catch (error: any) {
    console.error("KYC status error:", error);
    res.status(500).json({ error: "Failed to get KYC status" });
  }
});

router.post("/documents", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const userId = auth.userId;

    const { docType, fileName, fileData, fileSize } = req.body;

    if (!docType || !fileName || !fileData) {
      return res.status(400).json({ error: "Document type, file name, and file data are required" });
    }

    const maxSize = 2 * 1024 * 1024;
    if (fileSize && fileSize > maxSize) {
      return res.status(400).json({ error: "File size must be less than 2MB" });
    }

    await db.delete(kycDocuments).where(and(eq(kycDocuments.userId, userId), eq(kycDocuments.docType, docType)));

    const [doc] = await db.insert(kycDocuments).values({
      userId,
      docType,
      fileName,
      fileData,
      status: "uploaded",
    }).returning();

    res.json({
      message: "Document uploaded successfully",
      document: {
        id: doc.id,
        docType: doc.docType,
        fileName: doc.fileName,
        status: doc.status,
        uploadedAt: doc.uploadedAt,
      },
    });
  } catch (error: any) {
    console.error("Document upload error:", error);
    res.status(500).json({ error: error.message || "Failed to upload document" });
  }
});

router.get("/documents", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const userId = auth.userId;

    const docs = await db.select({
      id: kycDocuments.id,
      docType: kycDocuments.docType,
      fileName: kycDocuments.fileName,
      fileData: kycDocuments.fileData,
      status: kycDocuments.status,
      uploadedAt: kycDocuments.uploadedAt,
    }).from(kycDocuments).where(eq(kycDocuments.userId, userId));

    res.json(docs);
  } catch (error: any) {
    console.error("Get documents error:", error);
    res.status(500).json({ error: "Failed to get documents" });
  }
});

export default router;
