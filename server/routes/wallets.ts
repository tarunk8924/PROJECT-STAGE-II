import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { wallets, transactions, users, auditLogs } from "../../shared/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { getAuthPayload } from "../middleware/auth.js";
import { verifyFirebaseIdToken, isFirebaseConfigured } from "../utils/firebaseAdmin.js";
import { isCashfreeVerificationConfigured, verifyBankAccountViaCashfree } from "../utils/cashfree.js";

const router = Router();

const verifiedCollects = new Map<string, { userId: number; upiId: string; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of verifiedCollects) {
    if (val.expiresAt < now) verifiedCollects.delete(key);
  }
}, 60000);

const UPI_PROVIDERS: Record<string, string> = {
  "oksbi": "SBI Pay",
  "sbi": "SBI Pay",
  "okhdfcbank": "HDFC Bank",
  "hdfcbank": "HDFC Bank",
  "okicici": "iMobile Pay",
  "icici": "iMobile Pay",
  "okaxis": "Axis Pay",
  "axisbank": "Axis Pay",
  "ybl": "PhonePe",
  "ibl": "PhonePe",
  "axl": "PhonePe",
  "paytm": "Paytm",
  "ptaxis": "Paytm",
  "pthdfc": "Paytm",
  "ptsbi": "Paytm",
  "ptyes": "Paytm",
  "apl": "Amazon Pay",
  "ratn": "Amazon Pay",
  "yapl": "Amazon Pay",
  "barodampay": "Bank of Baroda",
  "mahb": "Bank of Baroda",
  "cnrb": "Canara Bank",
  "fbl": "Federal Bank",
  "federal": "Federal Bank",
  "kotak": "Kotak",
  "kmbl": "Kotak",
  "indus": "IndusInd Bank",
  "uboi": "Union Bank",
  "unionbankofindia": "Union Bank",
  "upi": "BHIM UPI",
  "jupiteraxis": "Jupiter",
  "jupiter": "Jupiter",
  "slice": "Slice",
  "niyoicici": "Niyo",
  "yesbankltd": "Yes Bank",
  "yesbank": "Yes Bank",
  "pnb": "PNB",
  "pingpay": "Google Pay",
  "gpay": "Google Pay",
  "waicici": "WhatsApp Pay",
  "wasbi": "WhatsApp Pay",
  "waaxis": "WhatsApp Pay",
  "wahdfc": "WhatsApp Pay",
};

const VALID_UPI_HANDLES = Object.keys(UPI_PROVIDERS);

function detectUpiProvider(upiId: string): string {
  const handle = upiId.split("@")[1]?.toLowerCase();
  if (!handle) return "Unknown";
  return UPI_PROVIDERS[handle] || "UPI";
}

function validateUpiId(upiId: string): { valid: boolean; error?: string; provider?: string } {
  if (!upiId || typeof upiId !== "string") {
    return { valid: false, error: "UPI ID is required" };
  }

  const trimmed = upiId.trim().toLowerCase();

  if (!trimmed.includes("@")) {
    return { valid: false, error: "UPI ID must contain @ symbol (e.g., yourname@ybl)" };
  }

  const parts = trimmed.split("@");
  if (parts.length !== 2) {
    return { valid: false, error: "UPI ID must have exactly one @ symbol" };
  }

  const [username, handle] = parts;

  if (!username || username.length < 1) {
    return { valid: false, error: "UPI username cannot be empty" };
  }

  if (!/^[a-z0-9._-]+$/.test(username)) {
    return { valid: false, error: "UPI username can only contain letters, numbers, dots, hyphens, and underscores" };
  }

  if (username.length > 50) {
    return { valid: false, error: "UPI username is too long (max 50 characters)" };
  }

  if (!handle || handle.length < 2) {
    return { valid: false, error: "Invalid UPI handle after @" };
  }

  if (!/^[a-z0-9]+$/.test(handle)) {
    return { valid: false, error: "UPI handle can only contain lowercase letters and numbers" };
  }

  if (!VALID_UPI_HANDLES.includes(handle)) {
    return { valid: false, error: `Unrecognized UPI handle "@${handle}". Please use a valid UPI ID from a recognized provider (e.g., @ybl, @oksbi, @paytm, @okhdfcbank)` };
  }

  if (username.length < 3) {
    return { valid: false, error: "UPI username must be at least 3 characters" };
  }

  const provider = detectUpiProvider(trimmed);

  return { valid: true, provider };
}

function validateIfscCode(ifsc: string): { valid: boolean; error?: string } {
  if (!ifsc || typeof ifsc !== "string") {
    return { valid: false, error: "IFSC code is required" };
  }

  const code = ifsc.trim().toUpperCase();

  if (code.length !== 11) {
    return { valid: false, error: "IFSC code must be exactly 11 characters" };
  }

  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) {
    return { valid: false, error: "Invalid IFSC format. Must be 4 letters + 0 + 6 alphanumeric chars (e.g., SBIN0001234)" };
  }

  return { valid: true };
}

function validateAccountNumber(accNumber: string): { valid: boolean; error?: string } {
  if (!accNumber || typeof accNumber !== "string") {
    return { valid: false, error: "Account number is required" };
  }

  const cleaned = accNumber.replace(/\s/g, "");

  if (!/^\d+$/.test(cleaned)) {
    return { valid: false, error: "Account number must contain only digits" };
  }

  if (cleaned.length < 9) {
    return { valid: false, error: "Account number must be at least 9 digits" };
  }

  if (cleaned.length > 18) {
    return { valid: false, error: "Account number cannot exceed 18 digits" };
  }

  return { valid: true };
}

function validateMobileNumber(mobile: string): { valid: boolean; error?: string } {
  if (!mobile || typeof mobile !== "string") {
    return { valid: false, error: "Mobile number is required for OTP verification" };
  }

  const cleaned = mobile.replace(/[\s-+]/g, "");

  const num = cleaned.startsWith("91") && cleaned.length === 12 ? cleaned.slice(2) : cleaned;

  if (!/^\d{10}$/.test(num)) {
    return { valid: false, error: "Enter a valid 10-digit Indian mobile number" };
  }

  if (!/^[6-9]/.test(num)) {
    return { valid: false, error: "Indian mobile numbers must start with 6, 7, 8, or 9" };
  }

  return { valid: true };
}

async function lookupIfsc(ifsc: string): Promise<{ bankName?: string; branchName?: string; city?: string; state?: string } | null> {
  try {
    const response = await fetch(`https://ifsc.razorpay.com/${ifsc.toUpperCase()}`);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      bankName: data.BANK,
      branchName: data.BRANCH,
      city: data.CITY,
      state: data.STATE,
    };
  } catch {
    return null;
  }
}

function normalizeIndianPhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^91/, "");
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

function getNameTokens(value: string): string[] {
  return normalizeName(value).split(" ").filter((token) => token.length > 1);
}

function compareNameSimilarity(profileName: string, accountHolder: string) {
  const profileTokens = new Set(getNameTokens(profileName));
  const holderTokens = new Set(getNameTokens(accountHolder));

  if (profileTokens.size === 0 || holderTokens.size === 0) {
    return { score: 0, status: "unknown" as const };
  }

  const matches = [...holderTokens].filter((token) => profileTokens.has(token)).length;
  const score = Math.round((matches / Math.max(profileTokens.size, holderTokens.size)) * 100);

  if (score >= 80) return { score, status: "strong" as const };
  if (score >= 50) return { score, status: "partial" as const };
  return { score, status: "weak" as const };
}

function isSuspiciousAccountNumber(accNumber: string) {
  const cleaned = accNumber.replace(/\s/g, "");
  return /^(\d)\1+$/.test(cleaned) || cleaned === "0123456789" || cleaned === "9876543210";
}

function buildBankVerificationChecks(input: {
  profileName: string;
  accountHolder: string;
  ifscResolved: boolean;
  mobileVerifiedByOtp: boolean;
  similarityScore: number;
  similarityStatus: "strong" | "partial" | "weak" | "unknown";
}) {
  return [
    {
      key: "profile_name_alignment",
      label: "Profile and account-holder name alignment",
      status: input.similarityStatus === "strong" ? "passed" : input.similarityStatus === "partial" ? "review" : "failed",
      details: `Similarity score ${input.similarityScore}%`,
    },
    {
      key: "ifsc_resolution",
      label: "IFSC branch resolution",
      status: input.ifscResolved ? "passed" : "failed",
      details: input.ifscResolved ? "Branch metadata resolved successfully" : "Bank/branch could not be resolved from IFSC",
    },
    {
      key: "mobile_ownership",
      label: "Registered mobile OTP",
      status: input.mobileVerifiedByOtp ? "passed" : "pending",
      details: input.mobileVerifiedByOtp ? "Mobile ownership confirmed" : "OTP confirmation required",
    },
  ];
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const userWallets = await db.select().from(wallets).where(eq(wallets.userId, auth.userId));
    const masked = userWallets.map(w => ({
      ...w,
      accountNumber: w.accountNumber ? "XXXX" + w.accountNumber.slice(-4) : null,
      mobileNumber: w.mobileNumber ? "XXXXXX" + w.mobileNumber.slice(-4) : null,
      verificationCode: undefined,
    }));
    res.json(masked);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch wallets" });
  }
});

router.get("/ifsc/:code", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { code } = req.params;
    const validation = validateIfscCode(code as string);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const ifscData = await lookupIfsc(code as string);
    if (!ifscData) {
      return res.status(404).json({ error: "IFSC code not found. Please check and re-enter." });
    }

    res.json(ifscData);
  } catch (error) {
    res.status(500).json({ error: "Failed to lookup IFSC code" });
  }
});

async function verifyUpiViaRazorpay(upiId: string): Promise<{ success: boolean; customerName?: string; unavailable?: boolean }> {
  const keyId = process.env.RAZORPAY_LIVE_KEY_ID || process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_LIVE_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return { success: false, unavailable: true };
  }

  const endpoints = [
    "https://api.razorpay.com/v1/payments/validate/vpa",
    "https://api.razorpay.com/v1/payments/validate/account",
  ];

  for (const endpoint of endpoints) {
    try {
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
      const body = endpoint.includes("/account")
        ? JSON.stringify({ entity: "vpa", value: upiId })
        : JSON.stringify({ vpa: upiId });

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body,
      });

      const data = await response.json() as any;
      console.log(`[UPI Verify] Endpoint: ${endpoint}, VPA: ${upiId}, Status: ${response.status}, Response:`, JSON.stringify(data));

      if (response.ok && (data.success || data.valid)) {
        return { success: true, customerName: data.customer_name || data.name || undefined };
      }

      if (response.status === 404 || data.error?.description?.includes("not found on the server")) {
        continue;
      }

      if (data.error?.description?.includes("test mode") || data.error?.description?.includes("not supported") ||
          data.error?.description?.includes("not activated") || data.error?.description?.includes("not enabled") ||
          data.error?.description?.includes("Authentication failed")) {
        console.log(`[UPI Verify] VPA validation not available on this endpoint:`, data.error?.description);
        continue;
      }

      if (data.success === false || data.valid === false) {
        return { success: false };
      }
    } catch (err: any) {
      console.log(`[UPI Verify] Error on ${endpoint}:`, err.message);
      continue;
    }
  }

  console.log(`[UPI Verify] VPA validation not available on any endpoint, falling back to format validation`);
  return { success: false, unavailable: true };
}

router.get("/validate-upi/:upiId", async (_req: Request, res: Response) => {
  return res.status(410).json({
    valid: false,
    error: "UPI linking has been disabled. Please add a bank account instead.",
  });
});

router.post("/verify-upi-collect", async (_req: Request, res: Response) => {
  return res.status(410).json({
    success: false,
    error: "UPI linking has been disabled. Please add a bank account instead.",
  });
});

router.post("/upi", async (_req: Request, res: Response) => {
  return res.status(410).json({
    error: "UPI linking has been disabled. Please add a bank account instead.",
  });
});

router.post("/bank", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { bankName, accountNumber, ifscCode, accountHolder, accountType, label, mobileNumber } = req.body;

    if (!accountHolder || accountHolder.trim().length < 2) {
      return res.status(400).json({ error: "Account holder name must be at least 2 characters" });
    }

    if (!/^[a-zA-Z\s.'-]+$/.test(accountHolder.trim())) {
      return res.status(400).json({ error: "Account holder name can only contain letters, spaces, dots, hyphens, and apostrophes" });
    }

    const ifscValidation = validateIfscCode(ifscCode);
    if (!ifscValidation.valid) {
      return res.status(400).json({ error: ifscValidation.error });
    }

    const accValidation = validateAccountNumber(accountNumber);
    if (!accValidation.valid) {
      return res.status(400).json({ error: accValidation.error });
    }

    const mobileValidation = validateMobileNumber(mobileNumber);
    if (!mobileValidation.valid) {
      return res.status(400).json({ error: mobileValidation.error });
    }

    if (accountType && !["savings", "current"].includes(accountType)) {
      return res.status(400).json({ error: "Account type must be 'savings' or 'current'" });
    }

    const trimmedAccountNumber = accountNumber.trim();
    const trimmedIfscCode = ifscCode.toUpperCase().trim();

    const existing = await db.select().from(wallets)
      .where(and(eq(wallets.userId, auth.userId), eq(wallets.accountNumber, trimmedAccountNumber)));

    if (existing.length > 0) {
      return res.status(400).json({ error: "This bank account is already linked to your account" });
    }

    if (isSuspiciousAccountNumber(trimmedAccountNumber)) {
      return res.status(400).json({ error: "Account number pattern looks invalid. Please re-check and enter your real bank account number." });
    }

    const [user] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, auth.userId));
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let resolvedBankName = bankName;
    let branchName = "";
    const ifscData = await lookupIfsc(trimmedIfscCode);
    if (!ifscData) {
      return res.status(400).json({ error: "We could not resolve this IFSC code to a real branch. Please verify the IFSC and try again." });
    }

    if (!bankName || bankName === "Other") {
      resolvedBankName = ifscData.bankName || bankName;
    }
    branchName = ifscData.branchName || "";

    const maskedAccount = "XXXX" + trimmedAccountNumber.slice(-4);
    const cleanMobile = normalizeIndianPhone(mobileNumber);
    const trimmedAccountHolder = accountHolder.trim();
    const nameCheck = compareNameSimilarity(user.fullName || "", trimmedAccountHolder);

    if (nameCheck.status === "weak") {
      return res.status(400).json({
        error: "Account holder name does not align closely enough with your profile name. For this project, please link a bank account in your own name.",
        verificationProvider: "internal_review",
        nameMatchScore: nameCheck.score,
      });
    }

    if (isCashfreeVerificationConfigured()) {
      const cashfreeResult = await verifyBankAccountViaCashfree({
        accountNumber: trimmedAccountNumber,
        ifscCode: trimmedIfscCode,
        accountHolder: trimmedAccountHolder,
        phone: cleanMobile,
      });

      if (!cashfreeResult.success) {
        return res.status(400).json({
          error: cashfreeResult.error || "Bank account could not be verified via Cashfree",
          verificationProvider: "cashfree",
          accountStatus: cashfreeResult.accountStatus,
          nameMatchResult: cashfreeResult.nameMatchResult,
        });
      }

      if (cashfreeResult.nameMatchResult && cashfreeResult.nameMatchResult.toUpperCase() === "NO_MATCH") {
        return res.status(400).json({
          error: `Account holder name does not match bank records${cashfreeResult.nameAtBank ? ` (bank shows ${cashfreeResult.nameAtBank})` : ""}`,
          verificationProvider: "cashfree",
          nameAtBank: cashfreeResult.nameAtBank,
          nameMatchResult: cashfreeResult.nameMatchResult,
        });
      }

      const existingVerified = await db.select().from(wallets)
        .where(and(eq(wallets.userId, auth.userId), eq(wallets.isVerified, true)));
      const isPrimary = existingVerified.length === 0;

      const [wallet] = await db.insert(wallets).values({
        userId: auth.userId,
        type: "bank",
        label: label || `${cashfreeResult.bankName || resolvedBankName} - ${maskedAccount}`,
        bankName: cashfreeResult.bankName || resolvedBankName,
        branchName: cashfreeResult.branchName || branchName,
        accountNumber: trimmedAccountNumber,
        accountType: accountType || "savings",
        ifscCode: trimmedIfscCode,
        accountHolder: trimmedAccountHolder,
        mobileNumber: cleanMobile,
        isPrimary,
        isVerified: true,
        verificationCode: null,
        codeExpiresAt: null,
        verifiedAt: new Date(),
      }).returning();

      await db.insert(auditLogs).values({
        userId: auth.userId,
        action: "wallet_bank_verified_cashfree",
        entity: "wallet",
        entityId: wallet.id,
        details: JSON.stringify({
          bankName: cashfreeResult.bankName || resolvedBankName,
          ifscCode: trimmedIfscCode,
          nameMatchResult: cashfreeResult.nameMatchResult,
          nameMatchScore: cashfreeResult.nameMatchScore,
        }),
      });

      return res.json({
        ...wallet,
        accountNumber: maskedAccount,
        verificationCode: undefined,
        autoVerified: true,
        verificationProvider: "cashfree",
        bankAccountStatus: cashfreeResult.accountStatus,
        nameAtBank: cashfreeResult.nameAtBank,
        nameMatchResult: cashfreeResult.nameMatchResult,
        message: `Bank account verified via Cashfree and linked successfully${cashfreeResult.nameAtBank ? ` for ${cashfreeResult.nameAtBank}` : ""}.`,
      });
    }

    if (!isFirebaseConfigured()) {
      return res.status(503).json({ error: "Neither Cashfree bank verification nor Firebase Phone Auth is configured" });
    }

    const verificationChecks = buildBankVerificationChecks({
      profileName: user.fullName || "",
      accountHolder: trimmedAccountHolder,
      ifscResolved: true,
      mobileVerifiedByOtp: false,
      similarityScore: nameCheck.score,
      similarityStatus: nameCheck.status,
    });

    const [wallet] = await db.insert(wallets).values({
      userId: auth.userId,
      type: "bank",
      label: label || `${resolvedBankName} - ${maskedAccount}`,
      bankName: resolvedBankName,
      branchName,
      accountNumber: trimmedAccountNumber,
      accountType: accountType || "savings",
      ifscCode: trimmedIfscCode,
      accountHolder: trimmedAccountHolder,
      mobileNumber: cleanMobile,
      isPrimary: false,
      isVerified: false,
      verificationCode: null,
      codeExpiresAt: null,
    }).returning();

    await db.insert(auditLogs).values({
      userId: auth.userId,
      action: "wallet_bank_verification_started",
      entity: "wallet",
      entityId: wallet.id,
      details: JSON.stringify({
        bankName: resolvedBankName,
        branchName,
        ifscCode: trimmedIfscCode,
        nameMatchScore: nameCheck.score,
        nameMatchStatus: nameCheck.status,
      }),
    });

    res.json({
      ...wallet,
      accountNumber: maskedAccount,
      verificationCode: undefined,
      otpProvider: "firebase",
      mobileNumber: cleanMobile,
      verificationProvider: "internal_review",
      verificationChecks,
      nameMatchScore: nameCheck.score,
      nameMatchStatus: nameCheck.status,
      message: `Bank account pre-checks passed for ${resolvedBankName}. Firebase OTP will be sent to XXXXXX${mobileNumber.slice(-4)} to complete mobile ownership verification.`,
    });
  } catch (error) {
    console.error("Cashfree bank link error:", error);
    res.status(500).json({ error: "Failed to add bank account" });
  }
});

router.post("/:id/verify", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const walletId = parseInt(req.params.id as string);
    const { firebaseIdToken } = req.body;

    if (!firebaseIdToken) {
      return res.status(400).json({ error: "Firebase phone verification is required" });
    }

    const [wallet] = await db.select().from(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, auth.userId)));

    if (!wallet) return res.status(404).json({ error: "Wallet not found" });

    if (wallet.isVerified) return res.status(400).json({ error: "Wallet is already verified" });

    const verifiedPhone = await verifyFirebaseIdToken(firebaseIdToken);
    if (!wallet.mobileNumber || normalizeIndianPhone(verifiedPhone.phone) !== normalizeIndianPhone(wallet.mobileNumber)) {
      return res.status(400).json({ error: "Verified phone number does not match the wallet mobile number" });
    }

    const existingVerified = await db.select().from(wallets)
      .where(and(eq(wallets.userId, auth.userId), eq(wallets.isVerified, true)));
    const isPrimary = existingVerified.length === 0;

    await db.update(wallets)
      .set({
        isVerified: true,
        isPrimary,
        verificationCode: null,
        codeExpiresAt: null,
        verifiedAt: new Date(),
      })
      .where(eq(wallets.id, walletId));

    await db.insert(auditLogs).values({
      userId: auth.userId,
      action: wallet.type === "bank" ? "wallet_bank_mobile_verified" : "wallet_upi_mobile_verified",
      entity: "wallet",
      entityId: walletId,
      details: JSON.stringify({ type: wallet.type, mobileNumber: wallet.mobileNumber }),
    });

    res.json({ message: wallet.type === "bank" ? "Bank account verification checkpoint completed successfully!" : "Wallet verified successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Failed to verify wallet" });
  }
});

router.post("/:id/resend", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const walletId = parseInt(req.params.id as string);

    const [wallet] = await db.select().from(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, auth.userId)));

    if (!wallet) return res.status(404).json({ error: "Wallet not found" });
    if (wallet.isVerified) return res.status(400).json({ error: "Wallet is already verified" });

    if (!isFirebaseConfigured()) {
      return res.status(503).json({ error: "Firebase Phone Auth is not configured" });
    }

    res.json({
      otpProvider: "firebase",
      mobileNumber: wallet.mobileNumber,
      message: "Use Firebase Phone Auth to request a new OTP",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to resend code" });
  }
});

router.put("/:id/primary", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const walletId = parseInt(req.params.id as string);

    const [wallet] = await db.select().from(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, auth.userId)));

    if (!wallet) return res.status(404).json({ error: "Wallet not found" });

    if (!wallet.isVerified) {
      return res.status(400).json({ error: "Only verified wallets can be set as primary" });
    }

    await db.update(wallets)
      .set({ isPrimary: false })
      .where(eq(wallets.userId, auth.userId));

    await db.update(wallets)
      .set({ isPrimary: true })
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, auth.userId)));

    res.json({ message: "Primary wallet updated" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update primary wallet" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const walletId = parseInt(req.params.id as string);

    const [wallet] = await db.select().from(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, auth.userId)));

    if (!wallet) return res.status(404).json({ error: "Wallet not found" });

    await db.delete(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, auth.userId)));

    if (wallet.isPrimary) {
      const remaining = await db.select().from(wallets)
        .where(and(eq(wallets.userId, auth.userId), eq(wallets.isVerified, true)));
      if (remaining.length > 0) {
        await db.update(wallets)
          .set({ isPrimary: true })
          .where(eq(wallets.id, remaining[0].id));
      }
    }

    res.json({ message: "Wallet removed" });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove wallet" });
  }
});

router.get("/transactions", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const userTransactions = await db.select().from(transactions)
      .where(eq(transactions.userId, auth.userId))
      .orderBy(desc(transactions.createdAt));

    res.json(userTransactions);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

export default router;