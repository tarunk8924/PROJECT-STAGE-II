import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Blocks, Mail, ArrowLeft, CheckCircle, AlertCircle, KeyRound } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [simulatedLink, setSimulatedLink] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api.auth.forgotPassword(email);
      setSuccess(true);
      if (result.simulatedLink) {
        setSimulatedLink(result.simulatedLink);
      }
    } catch (err: any) {
      setError(err.message || "Failed to send reset link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Blocks className="w-10 h-10 text-indigo-300" />
            <h1 className="text-3xl font-bold text-white">MicroCredit</h1>
          </div>
          <p className="text-indigo-300">Blockchain-Based Micro Lending for Freelancers</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <KeyRound className="w-6 h-6 text-indigo-600" />
            <h2 className="text-2xl font-bold text-gray-900">Forgot Password</h2>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {success ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
                  <CheckCircle className="w-5 h-5" />
                  Reset Link Sent
                </div>
                <p className="text-sm text-green-600">
                  If an account with that email exists, a password reset link has been sent.
                  The link expires in 1 hour.
                </p>
              </div>

              {simulatedLink && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-xs text-amber-600 mb-2 font-medium">Demo Mode: Click the link below to reset your password</p>
                  <Link
                    to={simulatedLink}
                    className="text-sm text-indigo-600 hover:text-indigo-800 underline break-all"
                  >
                    Click here to reset your password
                  </Link>
                </div>
              )}

              <div className="text-center">
                <Link to="/login" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center justify-center gap-1">
                  <ArrowLeft className="w-4 h-4" />
                  Back to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-6">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link to="/login" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center justify-center gap-1">
                  <ArrowLeft className="w-4 h-4" />
                  Back to Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
