type CashfreeBankVerificationResponse = {
  reference_id?: number;
  name_at_bank?: string;
  bank_name?: string;
  city?: string;
  branch?: string;
  micr?: number;
  name_match_score?: string;
  name_match_result?: string;
  account_status?: string;
  account_status_code?: string;
  utr?: string;
  ifsc_details?: {
    bank?: string;
    ifsc?: string;
    ifsc_subcode?: string;
    address?: string;
    city?: string;
    state?: string;
    branch?: string;
    category?: string;
    swift_code?: string;
    micr?: number;
    nbin?: number;
  };
  message?: string;
};

export type CashfreeBankVerificationResult = {
  configured: boolean;
  success: boolean;
  accountStatus?: string;
  accountStatusCode?: string;
  bankName?: string;
  branchName?: string;
  city?: string;
  nameAtBank?: string;
  nameMatchResult?: string;
  nameMatchScore?: string;
  referenceId?: number;
  raw?: CashfreeBankVerificationResponse;
  error?: string;
};

function getCashfreeBaseUrl() {
  const explicit = process.env.CASHFREE_VERIFICATION_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const env = (process.env.CASHFREE_ENV || "sandbox").trim().toLowerCase();
  return env === "production"
    ? "https://api.cashfree.com/verification"
    : "https://sandbox.cashfree.com/verification";
}

export function isCashfreeVerificationConfigured() {
  return Boolean(process.env.CASHFREE_CLIENT_ID && process.env.CASHFREE_CLIENT_SECRET);
}

export async function verifyBankAccountViaCashfree(input: {
  accountNumber: string;
  ifscCode: string;
  accountHolder?: string;
  phone?: string;
}): Promise<CashfreeBankVerificationResult> {
  if (!isCashfreeVerificationConfigured()) {
    return { configured: false, success: false, error: "Cashfree bank verification is not configured" };
  }

  const payload = {
    bank_account: input.accountNumber.trim(),
    ifsc: input.ifscCode.trim().toUpperCase(),
    ...(input.accountHolder?.trim() ? { name: input.accountHolder.trim() } : {}),
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
  };

  try {
    const response = await fetch(`${getCashfreeBaseUrl()}/bank-account/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": process.env.CASHFREE_CLIENT_ID as string,
        "x-client-secret": process.env.CASHFREE_CLIENT_SECRET as string,
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.json().catch(() => ({})) as CashfreeBankVerificationResponse;
    console.log("[Cashfree] Bank verification response:", JSON.stringify({ status: response.status, payload, raw }));

    if (!response.ok) {
      return {
        configured: true,
        success: false,
        error: raw.message || `Cashfree verification failed with status ${response.status}`,
        raw,
      };
    }

    return {
      configured: true,
      success: raw.account_status === "VALID",
      accountStatus: raw.account_status,
      accountStatusCode: raw.account_status_code,
      bankName: raw.bank_name || raw.ifsc_details?.bank,
      branchName: raw.branch || raw.ifsc_details?.branch,
      city: raw.city || raw.ifsc_details?.city,
      nameAtBank: raw.name_at_bank,
      nameMatchResult: raw.name_match_result,
      nameMatchScore: raw.name_match_score,
      referenceId: raw.reference_id,
      raw,
      error: raw.account_status === "VALID" ? undefined : raw.account_status_code || raw.message || "Bank account verification failed",
    };
  } catch (error: any) {
    return {
      configured: true,
      success: false,
      error: error?.message || "Cashfree verification failed",
    };
  }
}
