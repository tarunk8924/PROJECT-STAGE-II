import React, { useState, useEffect } from "react";
import type { ConfirmationResult } from "firebase/auth";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { confirmFirebasePhoneOtp, resetFirebaseRecaptcha, sendFirebasePhoneOtp } from "../lib/firebase";
import { Blocks, UserPlus, ArrowLeft, Timer, RefreshCw, Phone } from "lucide-react";
import OAuthButtons from "../components/OAuthButtons";

const RECAPTCHA_CONTAINER_ID = "firebase-register-recaptcha";

export default function Register() {
  const { register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"form" | "otp">("form");
  const [countdown, setCountdown] = useState(0);
  const [resending, setResending] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => () => resetFirebaseRecaptcha(RECAPTCHA_CONTAINER_ID), []);

  const getCleanPhone = () => phone.replace(/\D/g, "").replace(/^(\+91|91)/, "");

  const startFirebaseOtp = async (cleanedPhone: string) => {
    const result = await sendFirebasePhoneOtp(`+91${cleanedPhone}`, RECAPTCHA_CONTAINER_ID);
    setConfirmationResult(result);
    setMaskedPhone(`${cleanedPhone.slice(0, 2)}******${cleanedPhone.slice(-2)}`);
    setStep("otp");
    setCountdown(600);
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !fullName) {
      setError("Email and full name are required");
      return;
    }

    const cleanedPhone = getCleanPhone();
    if (!cleanedPhone) {
      setError("Phone number is required for OTP verification");
      return;
    }

    if (!/^[6-9]\d{9}$/.test(cleanedPhone)) {
      setError("Please enter a valid 10-digit Indian mobile number");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      await api.auth.sendOtp({ email, fullName, phone: cleanedPhone });
      await startFirebaseOtp(cleanedPhone);
    } catch (err: any) {
      setError(err.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setResending(true);
    setError("");
    try {
      const cleanedPhone = getCleanPhone();
      await api.auth.sendOtp({ email, fullName, phone: cleanedPhone });
      await startFirebaseOtp(cleanedPhone);
      setOtp("");
    } catch (err: any) {
      setError(err.message || "Failed to resend OTP");
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!otp || otp.length !== 6) {
      setError("Please enter a valid 6-digit OTP");
      return;
    }

    if (!confirmationResult) {
      setError("Please request OTP again");
      return;
    }

    setLoading(true);
    try {
      const { idToken } = await confirmFirebasePhoneOtp(confirmationResult, otp);
      await register(email, password, fullName, phone || undefined, idToken);
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Blocks className="w-10 h-10 text-indigo-300" />
            <h1 className="text-3xl font-bold text-white">MicroCredit</h1>
          </div>
          <p className="text-indigo-300">Create your freelancer account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {step === "form" ? (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Register</h2>

              {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="John Doe" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="you@example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-2.5 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-600">+91</span>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} required
                      maxLength={10}
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="9876543210" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="Min 6 characters" />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50">
                  <Phone className="w-4 h-4" />
                  {loading ? "Sending OTP..." : "Send OTP & Continue"}
                </button>
              </form>

              <div className="mt-4">
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                  <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-400">Or continue with</span></div>
                </div>
                <OAuthButtons />
              </div>

              <div className="mt-6 text-center text-sm text-gray-600">
                Already have an account?{" "}
                <Link to="/login" className="text-indigo-600 hover:text-indigo-800 font-medium">Sign in</Link>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => { setStep("form"); setOtp(""); setError(""); setConfirmationResult(null); }}
                className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 mb-4"
              >
                <ArrowLeft className="w-4 h-4" /> Back to form
              </button>

              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Phone className="w-7 h-7 text-indigo-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-1">Verify Your Mobile</h2>
                <p className="text-gray-500 text-sm">OTP sent to +91 {maskedPhone}</p>
              </div>

              {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Enter OTP</label>
                  <input
                    type="text"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    maxLength={6}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-center text-xl tracking-[0.5em] font-mono"
                    placeholder="000000"
                    autoFocus
                  />
                </div>

                {countdown > 0 && (
                  <div className="flex items-center justify-center gap-1 text-sm text-gray-500">
                    <Timer className="w-4 h-4" />
                    <span>OTP expires in {formatCountdown(countdown)}</span>
                  </div>
                )}

                <button type="submit" disabled={loading || otp.length !== 6}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50">
                  <UserPlus className="w-4 h-4" />
                  {loading ? "Creating Account..." : "Verify & Create Account"}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button
                  onClick={handleResendOtp}
                  disabled={resending}
                  className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${resending ? "animate-spin" : ""}`} />
                  {resending ? "Resending..." : "Resend OTP"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div id={RECAPTCHA_CONTAINER_ID} />
    </div>
  );
}
