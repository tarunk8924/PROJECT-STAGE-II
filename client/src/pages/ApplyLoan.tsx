import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { FileText, Calculator, AlertTriangle } from "lucide-react";

export default function ApplyLoan() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [amount, setAmount] = useState("");
  const [tenure, setTenure] = useState("6");
  const [purpose, setPurpose] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<any>(null);

  const loanAmount = parseFloat(amount) || 0;
  const loanTenure = parseInt(tenure) || 6;
  const creditScore = user?.creditScore || 500;
  const isZeroInterest = loanAmount < 15000;
  const interestRate = isZeroInterest ? 0 : (creditScore >= 750 ? 8 : creditScore >= 600 ? 12 : 18);
  const totalDue = isZeroInterest ? loanAmount : loanAmount + (loanAmount * interestRate * loanTenure) / (100 * 12);
  const monthlyEmi = isZeroInterest ? 0 : (loanTenure > 0 ? totalDue / loanTenure : 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api.loans.apply({ amount: loanAmount, tenure: loanTenure, purpose });
      setSuccess(result);
    } catch (err: any) {
      setError(err.message || "Failed to apply for loan");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Loan Application Submitted</h2>
          <p className="text-gray-500 mb-6">Your application is pending admin approval.</p>

          <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2 mb-6">
            <div className="flex justify-between"><span className="text-gray-600">Loan ID:</span><span className="font-medium">#{success.loan.id}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Amount:</span><span className="font-medium">₹{success.loan.amount.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Interest Rate:</span><span className="font-medium">{success.loan.interestRate || 0}%{success.loan.amount < 15000 ? " (No interest)" : ""}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Total Due:</span><span className="font-medium">₹{(success.loan.totalDue || success.loan.amount).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">{success.loan.monthlyEmi ? "Monthly EMI" : "Repayment"}:</span><span className="font-medium">{success.loan.monthlyEmi ? `₹${success.loan.monthlyEmi.toFixed(2)}` : "Lump Sum"}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Contract Hash:</span><span className="font-mono text-xs">{success.contract?.hash?.slice(0, 20)}...</span></div>
          </div>

          <button onClick={() => navigate("/my-loans")} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
            View My Loans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Apply for Micro Loan</h1>
        <p className="text-gray-500">Get instant micro-loans based on your credit score</p>
      </div>

      {!user?.isKycVerified && (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-orange-800">KYC verification required</p>
            <p className="text-xs text-orange-600 mt-1">Please complete your KYC verification before applying for a loan.</p>
          </div>
        </div>
      )}

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loan Amount (₹)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} required min="1000" max="500000"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="Enter amount (₹1,000 - ₹5,00,000)" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tenure (months)</label>
              <select value={tenure} onChange={e => setTenure(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
                {[3, 6, 9, 12, 18, 24].map(m => <option key={m} value={m}>{m} months</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Purpose (optional)</label>
              <textarea value={purpose} onChange={e => setPurpose(e.target.value)} rows={3}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="What will you use this loan for?" />
            </div>
            <button type="submit" disabled={loading || !user?.isKycVerified}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50">
              <FileText className="w-4 h-4" />
              {loading ? "Submitting..." : "Submit Application"}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calculator className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">Loan Preview</h3>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Amount</span><span className="font-medium">₹{loanAmount.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Interest Rate</span><span className="font-medium">{isZeroInterest ? "0% (No interest)" : `${interestRate}% p.a.`}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Tenure</span><span className="font-medium">{loanTenure} months</span></div>
            <hr />
            <div className="flex justify-between"><span className="text-gray-500">Total Due</span><span className="font-bold text-indigo-700">₹{totalDue.toFixed(2)}</span></div>
            {isZeroInterest ? (
              <div className="flex justify-between"><span className="text-gray-500">Repayment</span><span className="font-bold text-green-600">Lump Sum (No EMI)</span></div>
            ) : (
              <div className="flex justify-between"><span className="text-gray-500">Monthly EMI</span><span className="font-bold text-indigo-700">₹{monthlyEmi.toFixed(2)}</span></div>
            )}
            {isZeroInterest && loanAmount > 0 && (
              <div className="p-2 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs text-green-700">Loans under ₹15,000 are interest-free with lump sum repayment</p>
              </div>
            )}
          </div>
          <div className="mt-4 p-3 bg-indigo-50 rounded-lg">
            <p className="text-xs text-indigo-600">Your credit score: <strong>{creditScore}</strong></p>
            <p className="text-xs text-indigo-600">Risk tier: <strong>{user?.riskTier || "Medium"}</strong></p>
          </div>
        </div>
      </div>
    </div>
  );
}
