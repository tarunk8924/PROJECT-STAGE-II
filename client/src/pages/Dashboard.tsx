import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import {
  BarChart3, Wallet, CreditCard, Shield, TrendingUp, FileText, ArrowRight,
  Handshake, ShieldCheck, Calendar, Globe, Calculator, LineChart, CheckCircle2, AlertTriangle
} from "lucide-react";

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trustSummary, setTrustSummary] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.loans.my();
        setLoans(data);
        const [summary, activity] = await Promise.all([api.auth.trustSummary(), api.auth.timeline()]);
        setTrustSummary(summary);
        setTimeline(activity);
        await refreshUser();
      } catch (err: any) {
        setError(err.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const activeLoans = loans.filter(l => l.status === "active");
  const pendingLoans = loans.filter(l => l.status === "pending");

  const getScoreColor = (score: number) => {
    if (score === 0) return "text-gray-500";
    if (score >= 750) return "text-green-600";
    if (score >= 600) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBg = (score: number) => {
    if (score === 0) return "bg-gray-50 border-gray-200";
    if (score >= 750) return "bg-green-50 border-green-200";
    if (score >= 600) return "bg-yellow-50 border-yellow-200";
    return "bg-red-50 border-red-200";
  };

  const modules = [
    { to: "/apply-loan", label: "Apply Loan", desc: "Get micro-loans instantly", icon: FileText, color: "indigo" },
    { to: "/credit-score", label: "Credit Score", desc: "AI-powered scoring", icon: BarChart3, color: "green" },
    { to: "/my-loans", label: "My Loans", desc: "Track active loans", icon: Wallet, color: "blue" },
    { to: "/analytics", label: "Analytics", desc: "Repayment insights", icon: LineChart, color: "purple" },
    { to: "/p2p", label: "P2P Lending", desc: "Invest in peers", icon: Handshake, color: "amber" },
    { to: "/earnings", label: "Earnings", desc: "Gig income & platforms", icon: CreditCard, color: "teal" },
    { to: "/wallet", label: "Connect Wallet", desc: "UPI & bank accounts", icon: Wallet, color: "cyan" },
    { to: "/kyc", label: "KYC Verification", desc: "Identity & documents", icon: Shield, color: "rose" },
    { to: "/loan-calculator", label: "Loan Calculator", desc: "Estimate your EMI", icon: Calculator, color: "orange" },
  ];

  const colorMap: Record<string, { bg: string; hover: string; icon: string; text: string }> = {
    indigo: { bg: "bg-indigo-50", hover: "hover:bg-indigo-100", icon: "text-indigo-600", text: "text-indigo-700" },
    green: { bg: "bg-green-50", hover: "hover:bg-green-100", icon: "text-green-600", text: "text-green-700" },
    blue: { bg: "bg-blue-50", hover: "hover:bg-blue-100", icon: "text-blue-600", text: "text-blue-700" },
    purple: { bg: "bg-purple-50", hover: "hover:bg-purple-100", icon: "text-purple-600", text: "text-purple-700" },
    amber: { bg: "bg-amber-50", hover: "hover:bg-amber-100", icon: "text-amber-600", text: "text-amber-700" },
    teal: { bg: "bg-teal-50", hover: "hover:bg-teal-100", icon: "text-teal-600", text: "text-teal-700" },
    cyan: { bg: "bg-cyan-50", hover: "hover:bg-cyan-100", icon: "text-cyan-600", text: "text-cyan-700" },
    rose: { bg: "bg-rose-50", hover: "hover:bg-rose-100", icon: "text-rose-600", text: "text-rose-700" },
    orange: { bg: "bg-orange-50", hover: "hover:bg-orange-100", icon: "text-orange-600", text: "text-orange-700" },
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.fullName?.split(" ")[0]}</h1>
        <p className="text-gray-500">Here's your financial overview</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`p-5 rounded-xl border ${getScoreBg(user?.creditScore ?? 0)}`}>
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className={`w-5 h-5 ${getScoreColor(user?.creditScore ?? 0)}`} />
            <span className="text-sm font-medium text-gray-600">Credit Score</span>
          </div>
          <p className={`text-3xl font-bold ${getScoreColor(user?.creditScore ?? 0)}`}>{(user?.creditScore ?? 0) === 0 ? "Unscored" : user?.creditScore}</p>
          <p className="text-xs text-gray-500 mt-1">Risk: {user?.riskTier || (user?.creditScore === 0 ? "Unscored" : "N/A")}</p>
        </div>

        <div className="p-5 rounded-xl border bg-indigo-50 border-indigo-200">
          <div className="flex items-center gap-3 mb-2">
            <Wallet className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-medium text-gray-600">Wallet Balance</span>
          </div>
          <p className="text-3xl font-bold text-indigo-700">&#8377;{(user?.walletBalance || 0).toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Available funds</p>
        </div>

        <div className="p-5 rounded-xl border bg-purple-50 border-purple-200">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            <span className="text-sm font-medium text-gray-600">Reputation</span>
          </div>
          <p className="text-3xl font-bold text-purple-700">{user?.reputationScore || 50}/100</p>
          <p className="text-xs text-gray-500 mt-1">Trust score</p>
        </div>

        <div className="p-5 rounded-xl border bg-blue-50 border-blue-200">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-gray-600">KYC Status</span>
          </div>
          <p className={`text-lg font-bold ${user?.isKycVerified ? "text-green-600" : "text-orange-600"}`}>
            {user?.isKycVerified ? "Verified" : "Pending"}
          </p>
          {!user?.isKycVerified && (
            <Link to="/kyc" className="text-xs text-indigo-600 hover:underline mt-1 inline-block">Complete KYC &rarr;</Link>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Platform Modules</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {modules.map(({ to, label, desc, icon: Icon, color }) => {
            const c = colorMap[color];
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-col items-center gap-2 p-4 ${c.bg} ${c.hover} rounded-xl transition-colors text-center`}
              >
                <Icon className={`w-7 h-7 ${c.icon}`} />
                <span className={`text-sm font-semibold ${c.text}`}>{label}</span>
                <span className="text-xs text-gray-500">{desc}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Borrower Trust Summary</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "Phone Verified", ok: trustSummary?.phoneVerified },
              { label: "Bank Verified", ok: trustSummary?.bankVerified },
              { label: "KYC Reviewed", ok: trustSummary?.kycReviewed, sub: trustSummary?.kycStatus },
              { label: "Profile Verified", ok: trustSummary?.profileVerified },
              { label: "Earnings Evidence Reviewed", ok: trustSummary?.earningsEvidenceReviewed, sub: trustSummary?.earningsEvidenceStatus },
              { label: "Repayment Track", ok: (trustSummary?.repaymentSummary?.late || 0) === 0, sub: trustSummary ? `${trustSummary.repaymentSummary.onTime}/${trustSummary.repaymentSummary.total} on time` : undefined },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center gap-2">
                  {item.ok ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                  <span className="text-sm font-medium text-gray-800">{item.label}</span>
                </div>
                {item.sub ? <p className="text-xs text-gray-500 mt-1">{String(item.sub).replace(/_/g, " ")}</p> : null}
              </div>
            ))}
          </div>
          {trustSummary?.kycRejectionReason ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              Latest KYC rejection reason: {trustSummary.kycRejectionReason}
            </div>
          ) : null}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Active Loans</h2>
            <Link to="/my-loans" className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {loading ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : activeLoans.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No active loans</p>
              <Link to="/apply-loan" className="mt-2 inline-block text-sm text-indigo-600 hover:underline">Apply for a loan</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {activeLoans.slice(0, 3).map(loan => (
                <Link key={loan.id} to={`/loans/${loan.id}`} className="block p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900">&#8377;{loan.amount.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">{loan.purpose || "Personal Loan"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-green-600">&#8377;{(loan.amountRepaid || 0).toLocaleString()} paid</p>
                      <p className="text-xs text-gray-500">of &#8377;{loan.totalDue.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                    <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${Math.min(100, ((loan.amountRepaid || 0) / loan.totalDue) * 100)}%` }} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Overview</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-medium text-gray-700">Total Loans</span>
              </div>
              <span className="text-sm font-bold text-gray-900">{loans.length}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-gray-700">Active Loans</span>
              </div>
              <span className="text-sm font-bold text-gray-900">{activeLoans.length}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-amber-600" />
                <span className="text-sm font-medium text-gray-700">Pending Approval</span>
              </div>
              <span className="text-sm font-bold text-gray-900">{pendingLoans.length}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-medium text-gray-700">Reputation Score</span>
              </div>
              <span className="text-sm font-bold text-gray-900">{user?.reputationScore || 50}/100</span>
            </div>
          </div>

          {pendingLoans.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-700 font-medium">{pendingLoans.length} loan(s) pending approval</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Audit Timeline</h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-gray-500">No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {timeline.slice(0, 8).map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{event.label}</p>
                    {event.details?.reason ? <p className="text-xs text-gray-500 mt-1">{event.details.reason}</p> : null}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(event.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
