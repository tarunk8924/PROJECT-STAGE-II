import React, { useEffect, useState } from "react";
import type { ConfirmationResult } from "firebase/auth";
import { api } from "../lib/api";
import { confirmFirebasePhoneOtp, resetFirebaseRecaptcha, sendFirebasePhoneOtp } from "../lib/firebase";
import {
  AlertCircle,
  BadgeCheck,
  Building2,
  CheckCircle,
  Clock,
  CreditCard,
  Info,
  Loader2,
  Phone,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";

interface WalletItem {
  id: number;
  type: string;
  label: string;
  bankName?: string;
  branchName?: string;
  accountNumber?: string;
  accountType?: string;
  ifscCode?: string;
  accountHolder?: string;
  mobileNumber?: string;
  isPrimary: boolean;
  isVerified: boolean;
  createdAt: string;
}

interface IfscData {
  bankName?: string;
  branchName?: string;
  city?: string;
  state?: string;
}

const WALLET_RECAPTCHA_CONTAINER_ID = "firebase-wallet-recaptcha";

export default function ConnectWallet() {
  const [wallets, setWallets] = useState<WalletItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bankVerificationChecks, setBankVerificationChecks] = useState<any[]>([]);

  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountType, setAccountType] = useState("savings");
  const [bankLabel, setBankLabel] = useState("");
  const [bankMobile, setBankMobile] = useState("");
  const [ifscData, setIfscData] = useState<IfscData | null>(null);
  const [ifscLooking, setIfscLooking] = useState(false);
  const [ifscError, setIfscError] = useState("");
  const [accError, setAccError] = useState("");
  const [mobileError, setMobileError] = useState("");

  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [verifyingMobile, setVerifyingMobile] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const fetchWallets = async () => {
    try {
      const data = await api.wallets.list();
      setWallets((data || []).filter((item: WalletItem) => item.type === "bank"));
    } catch {
      setError("Failed to load bank accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallets();
  }, []);

  useEffect(() => () => resetFirebaseRecaptcha(WALLET_RECAPTCHA_CONTAINER_ID), []);

  const debounce = (fn: Function, ms: number) => {
    let timer: any;
    return (...args: any[]) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  };

  const lookupIfscDebounced = React.useMemo(() =>
    debounce(async (value: string) => {
      const code = value.trim().toUpperCase();
      if (code.length !== 11) {
        setIfscData(null);
        if (code.length > 0 && code.length < 11) setIfscError("IFSC code must be 11 characters");
        return;
      }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) {
        setIfscError("Invalid IFSC format (e.g., SBIN0001234)");
        setIfscData(null);
        return;
      }
      setIfscLooking(true);
      setIfscError("");
      try {
        const data = await api.wallets.lookupIfsc(code);
        setIfscData(data);
        if (data.bankName) setBankName(data.bankName);
      } catch (err: any) {
        setIfscError(err.message || "IFSC code not found");
        setIfscData(null);
      } finally {
        setIfscLooking(false);
      }
    }, 600), []);

  const handleIfscChange = (value: string) => {
    const upper = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);
    setIfscCode(upper);
    setIfscData(null);
    setIfscError("");
    lookupIfscDebounced(upper);
  };

  const validateAccountNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    setAccountNumber(cleaned);
    if (cleaned.length > 0 && cleaned.length < 9) setAccError("Account number must be at least 9 digits");
    else if (cleaned.length > 18) setAccError("Account number cannot exceed 18 digits");
    else setAccError("");
  };

  const validateMobile = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 10);
    setBankMobile(cleaned);
    if (cleaned.length === 10 && !/^[6-9]/.test(cleaned)) setMobileError("Must start with 6, 7, 8, or 9");
    else setMobileError("");
  };

  const startVerification = async (walletId: number, mobileNumber?: string) => {
    if (!mobileNumber) throw new Error("No mobile number available for verification");
    const confirmation = await sendFirebasePhoneOtp(`+91${mobileNumber}`, WALLET_RECAPTCHA_CONTAINER_ID);
    setVerifyingId(walletId);
    setVerifyingMobile(mobileNumber);
    setOtpCode("");
    setConfirmationResult(confirmation);
  };

  const handleVerify = async () => {
    if (!verifyingId || otpCode.length !== 6 || !confirmationResult) return;
    setVerifyLoading(true);
    setError("");
    try {
      const { idToken } = await confirmFirebasePhoneOtp(confirmationResult, otpCode);
      await api.wallets.verify(verifyingId, { firebaseIdToken: idToken });
      setSuccess("Bank account verified successfully!");
      setVerifyingId(null);
      setVerifyingMobile("");
      setOtpCode("");
      setConfirmationResult(null);
      fetchWallets();
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setVerifyLoading(false);
    }
  };

  const resetForm = () => {
    setBankName("");
    setAccountNumber("");
    setConfirmAccountNumber("");
    setIfscCode("");
    setAccountHolder("");
    setAccountType("savings");
    setBankLabel("");
    setBankMobile("");
    setIfscData(null);
    setIfscError("");
    setAccError("");
    setMobileError("");
  };

  const handleAddBank = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (accountNumber !== confirmAccountNumber) {
      setError("Account numbers don't match");
      return;
    }
    if (accountNumber.length < 9 || accountNumber.length > 18) {
      setError("Account number must be 9-18 digits");
      return;
    }
    if (!bankMobile || bankMobile.length !== 10) {
      setError("Enter a valid 10-digit mobile number");
      return;
    }
    if (ifscCode.length !== 11) {
      setError("Enter a valid 11-character IFSC code");
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.wallets.addBank({
        bankName: ifscData?.bankName || bankName,
        accountNumber,
        ifscCode,
        accountHolder,
        accountType,
        label: bankLabel || undefined,
        mobileNumber: bankMobile,
      });
      setBankVerificationChecks(result.verificationChecks || []);
      if (result.autoVerified) {
        setSuccess(result.message || "Bank account verified and linked successfully!");
      } else {
        await startVerification(result.id, result.mobileNumber);
        setSuccess(result.message || "Bank account linked! Verify with the OTP to complete.");
      }
      resetForm();
      fetchWallets();
    } catch (err: any) {
      setBankVerificationChecks([]);
      setError(err.message || "Failed to add bank account");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async (id: number) => {
    setError("");
    try {
      const result = await api.wallets.resend(id);
      if (!result.mobileNumber) throw new Error("No mobile number available for verification");
      const confirmation = await sendFirebasePhoneOtp(`+91${result.mobileNumber}`, WALLET_RECAPTCHA_CONTAINER_ID);
      setVerifyingId(id);
      setVerifyingMobile(result.mobileNumber);
      setOtpCode("");
      setConfirmationResult(confirmation);
      setSuccess("New verification code sent!");
    } catch (err: any) {
      setError(err.message || "Failed to resend code");
    }
  };

  const handleSetPrimary = async (id: number) => {
    try {
      await api.wallets.setPrimary(id);
      setSuccess("Primary bank account updated");
      fetchWallets();
    } catch (err: any) {
      setError(err.message || "Failed to update primary bank account");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this bank account?")) return;
    try {
      await api.wallets.remove(id);
      setSuccess("Bank account removed");
      if (verifyingId === id) {
        setVerifyingId(null);
        setVerifyingMobile("");
        setConfirmationResult(null);
      }
      fetchWallets();
    } catch {
      setError("Failed to remove bank account");
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-600 animate-spin" /></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Connect Wallet</h1>
        <p className="text-gray-500 mt-1">Link your bank account for loan disbursement and repayments</p>
      </div>

      {error && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}
      {success && <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm"><CheckCircle className="w-4 h-4 flex-shrink-0" />{success}</div>}

      {bankVerificationChecks.length > 0 && (
        <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-blue-800"><ShieldCheck className="w-4 h-4" /><h3 className="text-sm font-semibold">Bank Verification Checkpoints</h3></div>
          <div className="space-y-2">
            {bankVerificationChecks.map((check) => (
              <div key={check.key} className="flex items-start justify-between gap-3 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-gray-900">{check.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{check.details}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase ${check.status === "passed" ? "bg-green-100 text-green-700" : check.status === "pending" ? "bg-amber-100 text-amber-700" : check.status === "review" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>{check.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {verifyingId && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-amber-600" /><h3 className="font-semibold text-amber-900">Verify Your Bank Account</h3></div>
          <p className="text-sm text-amber-700">A 6-digit OTP has been sent via Firebase Phone Auth to +91 XXXXXX{verifyingMobile.slice(-4)}. Enter it below to complete verification.</p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-amber-800 mb-1">Enter OTP</label>
              <input type="text" value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter 6-digit OTP" maxLength={6} className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm text-center font-mono text-lg tracking-widest focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
            <button onClick={handleVerify} disabled={otpCode.length !== 6 || verifyLoading} className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed">{verifyLoading ? "Verifying..." : "Verify"}</button>
          </div>
          <p className="text-xs text-amber-600">Code expires in 10 minutes</p>
        </div>
      )}

      <form onSubmit={handleAddBank} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Building2 className="w-5 h-5 text-blue-600" /> Link Bank Account</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1"><span className="flex items-center gap-1"><Search className="w-3.5 h-3.5" /> IFSC Code <span className="text-red-500">*</span></span></label>
          <div className="relative">
            <input type="text" value={ifscCode} onChange={e => handleIfscChange(e.target.value)} placeholder="e.g., SBIN0001234" maxLength={11} className={`w-full border rounded-lg px-3 py-2 text-sm font-mono uppercase pr-10 focus:ring-2 focus:outline-none ${ifscData ? "border-green-400 focus:ring-green-500" : ifscError ? "border-red-400 focus:ring-red-500" : "border-gray-300 focus:ring-indigo-500"}`} required />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">{ifscLooking && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}{!ifscLooking && ifscData && <BadgeCheck className="w-4 h-4 text-green-500" />}{!ifscLooking && ifscError && ifscCode.length === 11 && <XCircle className="w-4 h-4 text-red-500" />}</div>
          </div>
          {ifscError && <p className="text-xs text-red-600 mt-1">{ifscError}</p>}
          {ifscData && <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm space-y-1"><p className="font-medium text-green-800">{ifscData.bankName}</p><p className="text-green-700 text-xs">{ifscData.branchName}{ifscData.city ? `, ${ifscData.city}` : ""}{ifscData.state ? `, ${ifscData.state}` : ""}</p></div>}
          <p className="text-xs text-gray-400 mt-1">Bank details will be auto-filled from IFSC code</p>
        </div>

        {!ifscData && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name <span className="text-red-500">*</span></label>
            <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none" required={!ifscData} />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Account Holder Name <span className="text-red-500">*</span></label>
          <input type="text" value={accountHolder} onChange={e => setAccountHolder(e.target.value)} placeholder="Full name as per bank records" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none" required />
          <p className="text-xs text-gray-400 mt-1">Must match the name on your bank account</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account Number <span className="text-red-500">*</span></label>
            <input type="password" value={accountNumber} onChange={e => validateAccountNumber(e.target.value)} placeholder="9-18 digit account number" maxLength={18} className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:outline-none ${accError ? "border-red-400 focus:ring-red-500" : "border-gray-300 focus:ring-indigo-500"}`} required />
            {accError && <p className="text-xs text-red-600 mt-1">{accError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Account Number <span className="text-red-500">*</span></label>
            <input type="text" value={confirmAccountNumber} onChange={e => setConfirmAccountNumber(e.target.value.replace(/\D/g, ""))} placeholder="Re-enter account number" maxLength={18} className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:outline-none ${confirmAccountNumber && accountNumber !== confirmAccountNumber ? "border-red-400 focus:ring-red-500" : confirmAccountNumber && accountNumber === confirmAccountNumber ? "border-green-400 focus:ring-green-500" : "border-gray-300 focus:ring-indigo-500"}`} required />
            {confirmAccountNumber && accountNumber !== confirmAccountNumber && <p className="text-xs text-red-600 mt-1">Account numbers don't match</p>}
            {confirmAccountNumber && accountNumber === confirmAccountNumber && accountNumber.length >= 9 && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Match confirmed</p>}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account Type <span className="text-red-500">*</span></label>
            <div className="flex gap-3">
              <label className={`flex-1 flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-colors ${accountType === "savings" ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-gray-300"}`}><input type="radio" name="accountType" value="savings" checked={accountType === "savings"} onChange={() => setAccountType("savings")} className="text-indigo-600" /><span className="text-sm font-medium">Savings</span></label>
              <label className={`flex-1 flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-colors ${accountType === "current" ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-gray-300"}`}><input type="radio" name="accountType" value="current" checked={accountType === "current"} onChange={() => setAccountType("current")} className="text-indigo-600" /><span className="text-sm font-medium">Current</span></label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1"><span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Registered Mobile <span className="text-red-500">*</span></span></label>
            <div className="flex"><span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-sm text-gray-600">+91</span><input type="text" value={bankMobile} onChange={e => validateMobile(e.target.value)} placeholder="10-digit number" maxLength={10} className="flex-1 border border-gray-300 rounded-r-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none" required /></div>
            {mobileError && <p className="text-xs text-red-600 mt-1">{mobileError}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Label (optional)</label>
          <input type="text" value={bankLabel} onChange={e => setBankLabel(e.target.value)} placeholder="e.g., Salary Account" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none" />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={submitting || !!accError || (accountNumber !== confirmAccountNumber && !!confirmAccountNumber)} className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">{submitting && <Loader2 className="w-4 h-4 animate-spin" />}Link Bank Account</button>
          <button type="button" onClick={() => { resetForm(); setBankVerificationChecks([]); setError(""); setSuccess(""); }} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Clear</button>
        </div>
      </form>

      <div className="space-y-3">
        <h2 className="font-semibold text-gray-900">Linked Bank Accounts</h2>
        {wallets.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No bank accounts linked yet</p>
            <p className="text-sm text-gray-400 mt-1">Add a bank account to receive loan disbursements</p>
          </div>
        ) : (
          wallets.map((w) => (
            <div key={w.id} className={`bg-white rounded-xl border p-4 ${!w.isVerified ? "border-amber-200" : "border-gray-200"}`}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-100"><Building2 className="w-5 h-5 text-blue-600" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-gray-900 truncate">{w.label}</p>
                    {w.isPrimary && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full flex items-center gap-1"><Star className="w-3 h-3" /> Primary</span>}
                    {w.isVerified ? <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Verified</span> : <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>}
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">{w.bankName} {w.accountType && <span className="text-xs capitalize">({w.accountType})</span>}<span className="font-mono">A/C {w.accountNumber || "****"}</span>{w.ifscCode && <span className="text-xs text-gray-400">{w.ifscCode}</span>}</div>
                  {w.branchName && <p className="text-xs text-gray-400 mt-0.5">{w.branchName}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!w.isVerified && <button onClick={() => handleResend(w.id)} title="Verify this bank account" className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium"><ShieldCheck className="w-4 h-4" /><span className="hidden sm:inline">Verify</span></button>}
                  {w.isVerified && !w.isPrimary && <button onClick={() => handleSetPrimary(w.id)} title="Set as primary" className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><Star className="w-4 h-4" /></button>}
                  <button onClick={() => handleDelete(w.id)} title="Remove" className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div id={WALLET_RECAPTCHA_CONTAINER_ID} />

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-medium text-blue-800">How Bank Linking Works</h3>
            <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside mt-2">
              <li>Enter your bank account details with IFSC code</li>
              <li>The app resolves the branch from IFSC, checks account-number sanity, and compares the account-holder name with your profile</li>
              <li>When provider verification is enabled, verified bank accounts are linked instantly</li>
              <li>Otherwise, Firebase Phone Auth OTP confirms mobile ownership before the account becomes usable</li>
              <li>Set one verified bank account as primary for loan disbursement and repayments</li>
            </ol>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-medium text-blue-800">Security</h3>
            <p className="text-xs text-blue-700 mt-1">Account numbers are masked after storage. Only verified bank accounts can be used for platform transactions.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
