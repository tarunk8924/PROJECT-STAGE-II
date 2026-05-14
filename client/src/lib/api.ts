const API_BASE = "/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function request(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    const requestError = new Error(error.error || "Request failed") as Error & { details?: any };
    requestError.details = error;
    throw requestError;
  }

  return res.json();
}

export const api = {
  auth: {
    sendOtp: (data: { email: string; fullName: string; phone: string }) =>
      request("/auth/send-otp", { method: "POST", body: JSON.stringify(data) }),
    register: (data: { email: string; password: string; fullName: string; phone?: string; firebaseIdToken: string }) =>
      request("/auth/register", { method: "POST", body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request("/auth/login", { method: "POST", body: JSON.stringify(data) }),
    me: () => request("/auth/me"),
    trustSummary: () => request("/auth/trust-summary"),
    timeline: () => request("/auth/timeline"),
    firebaseConfig: () => request("/auth/firebase-config"),
    oauthGoogle: (credential: string) =>
      request("/auth/oauth/google", { method: "POST", body: JSON.stringify({ credential }) }),
    oauthMicrosoft: (idToken: string) =>
      request("/auth/oauth/microsoft", { method: "POST", body: JSON.stringify({ idToken }) }),
    oauthConfig: () => request("/auth/oauth/config"),
    forgotPassword: (email: string) =>
      request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
    resetPassword: (token: string, newPassword: string) =>
      request("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword }) }),
    msg91WidgetToken: () => request("/auth/msg91-widget-token"),
  },
  kyc: {
    verify: (data: { idType: string; idNumber: string; fullName: string; dateOfBirth?: string; address?: string }) =>
      request("/kyc/verify", { method: "POST", body: JSON.stringify(data) }),
    status: () => request("/kyc/status"),
    verificationMode: () => request("/kyc/verification-mode"),
    sendAadhaarOtp: (aadhaarNumber: string, mobileNumber?: string) =>
      request("/kyc/aadhaar/send-otp", { method: "POST", body: JSON.stringify({ aadhaarNumber, mobileNumber }) }),
    verifyAadhaarOtp: (data: { aadhaarNumber: string; firebaseIdToken: string }) =>
      request("/kyc/aadhaar/verify-otp", { method: "POST", body: JSON.stringify(data) }),
    resendAadhaarOtp: () =>
      request("/kyc/aadhaar/resend-otp", { method: "POST" }),
    submitReview: (data: { idType: string; idNumber?: string; fullName: string; dateOfBirth?: string; address?: string; verificationMethod: string; notes?: string }) =>
      request("/kyc/submit-review", { method: "POST", body: JSON.stringify(data) }),
    uploadDocument: (data: { docType: string; fileName: string; fileData: string; fileSize?: number }) =>
      request("/kyc/documents", { method: "POST", body: JSON.stringify(data) }),
    documents: () => request("/kyc/documents"),
  },
  earnings: {
    addGig: (data: { platform: string; amount: number; description?: string; earnedAt?: string }) =>
      request("/earnings/gig", { method: "POST", body: JSON.stringify(data) }),
    getGig: () => request("/earnings/gig"),
    addPayment: (data: { type: string; amount: number; from?: string; to?: string; reference?: string }) =>
      request("/earnings/payment", { method: "POST", body: JSON.stringify(data) }),
    getPayments: () => request("/earnings/payment"),
  },
  score: {
    get: (userId: number) => request(`/score/${userId}`),
    history: (userId: number) => request(`/score/${userId}/history`),
  },
  loans: {
    apply: (data: { amount: number; tenure: number; purpose?: string }) =>
      request("/loans/apply", { method: "POST", body: JSON.stringify(data) }),
    my: () => request("/loans/my"),
    get: (loanId: number) => request(`/loans/${loanId}`),
  },
  repay: {
    make: (loanId: number, amount: number) =>
      request(`/repay/${loanId}`, { method: "POST", body: JSON.stringify({ amount }) }),
    retry: (transactionId: number) =>
      request(`/repay/retry/${transactionId}`, { method: "POST" }),
  },
  wallets: {
    list: () => request("/wallets"),
    lookupIfsc: (code: string) => request(`/wallets/ifsc/${code}`),
    validateUpi: (upiId: string) => request(`/wallets/validate-upi/${encodeURIComponent(upiId)}`),
    verifyUpiCollect: (upiId: string) =>
      request("/wallets/verify-upi-collect", { method: "POST", body: JSON.stringify({ upiId }) }),
    addUpi: (data: { upiId: string; label?: string; mobileNumber?: string; collectVerified?: boolean; collectId?: string }) =>
      request("/wallets/upi", { method: "POST", body: JSON.stringify(data) }),
    addBank: (data: { bankName: string; accountNumber: string; ifscCode: string; accountHolder: string; accountType?: string; label?: string; mobileNumber: string }) =>
      request("/wallets/bank", { method: "POST", body: JSON.stringify(data) }),
    verify: (id: number, data: { firebaseIdToken: string }) =>
      request(`/wallets/${id}/verify`, { method: "POST", body: JSON.stringify(data) }),
    resend: (id: number) =>
      request(`/wallets/${id}/resend`, { method: "POST" }),
    setPrimary: (id: number) =>
      request(`/wallets/${id}/primary`, { method: "PUT" }),
    remove: (id: number) =>
      request(`/wallets/${id}`, { method: "DELETE" }),
    transactions: () => request("/wallets/transactions"),
  },
  admin: {
    stats: () => request("/admin/stats"),
    users: () => request("/admin/users"),
    loans: () => request("/admin/loans"),
    kycPending: () => request("/admin/kyc/pending"),
    kycDocuments: (kycId: number) => request(`/admin/kyc/${kycId}/documents`),
    approveKyc: (kycId: number) => request(`/admin/kyc/${kycId}/approve`, { method: "POST" }),
    rejectKyc: (kycId: number, reason?: string) =>
      request(`/admin/kyc/${kycId}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
    approveLoan: (loanId: number) =>
      request(`/admin/loans/${loanId}/approve`, { method: "POST" }),
    rejectLoan: (loanId: number, reason?: string) =>
      request(`/admin/loans/${loanId}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
    auditLogs: () => request("/admin/audit-logs"),
    earningsEvidencePending: () => request("/admin/earnings-evidence/pending"),
    reviewEarningsEvidence: (connectionId: number, data: { decision: string; reason?: string }) =>
      request(`/admin/earnings-evidence/${connectionId}/review`, { method: "POST", body: JSON.stringify(data) }),
    contracts: () => request("/admin/contracts"),
    analytics: () => request("/admin/analytics"),
  },
  calculator: {
    calc: (amount: number, tenure: number, creditScore: number) =>
      request(`/calculator/calc?amount=${amount}&tenure=${tenure}&creditScore=${creditScore}`),
  },
  emi: {
    generate: (loanId: number) =>
      request(`/emi/generate/${loanId}`, { method: "POST" }),
    schedule: (loanId: number) =>
      request(`/emi/schedule/${loanId}`),
    remind: () =>
      request("/emi/remind", { method: "POST" }),
  },
  p2p: {
    available: () => request("/p2p/available"),
    fund: (loanId: number, amount: number) =>
      request(`/p2p/fund/${loanId}`, { method: "POST", body: JSON.stringify({ amount }) }),
    myInvestments: () => request("/p2p/my-investments"),
    poolStats: () => request("/p2p/pool-stats"),
  },
  insurance: {
    balance: () => request("/insurance/balance"),
    history: () => request("/insurance/history"),
  },
  razorpay: {
    config: () => request("/razorpay/config"),
    createOrder: (data: { amount: number; currency?: string; description?: string; loanId?: number }) =>
      request("/razorpay/create-order", { method: "POST", body: JSON.stringify(data) }),
    verify: (data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
      request("/razorpay/verify", { method: "POST", body: JSON.stringify(data) }),
    failed: (data: { orderId: string; errorCode?: string; errorDescription?: string }) =>
      request("/razorpay/failed", { method: "POST", body: JSON.stringify(data) }),
    payments: () => request("/razorpay/payments"),
    paymentDetails: (paymentId: string) => request(`/razorpay/payments/${paymentId}`),
  },
  gigPlatforms: {
    connections: () => request("/gig-platforms/connections"),
    connect: (platform: string, platformUsername: string) =>
      request("/gig-platforms/connect", { method: "POST", body: JSON.stringify({ platform, platformUsername }) }),
    sync: (connectionId: number) =>
      request(`/gig-platforms/sync/${connectionId}`, { method: "POST" }),
    disconnect: (connectionId: number) =>
      request(`/gig-platforms/${connectionId}`, { method: "DELETE" }),
    verifyProfile: (profileUrl: string) =>
      request("/gig-platforms/verify-profile", { method: "POST", body: JSON.stringify({ profileUrl }) }),
    screenshotOcr: (imageBase64: string, platform?: string) =>
      request("/gig-platforms/screenshot-ocr", { method: "POST", body: JSON.stringify({ imageBase64, platform }) }),
    metrics: () => request("/gig-platforms/metrics"),
  },
};
