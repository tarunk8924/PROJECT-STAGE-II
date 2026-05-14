import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Users, FileText, Wallet, BarChart3, TrendingUp, Clock, CheckCircle, XCircle, Shield, Activity, AlertTriangle, ExternalLink, Blocks } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

function getRecentMonths(count = 6) {
  const months: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [contracts, setContracts] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingDefaults, setCheckingDefaults] = useState(false);
  const [defaultResult, setDefaultResult] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.admin.stats().then(setStats),
      api.admin.analytics().then(setAnalytics),
      api.admin.contracts().then(setContracts),
      api.admin.auditLogs().then(setAuditLogs),
    ]).catch((err: any) => setError(err.message || "Failed to load admin data")).finally(() => setLoading(false));
  }, []);

  const handleCheckDefaults = async () => {
    setCheckingDefaults(true);
    try {
      const result = await api.admin.stats().then(() =>
        fetch("/api/admin/check-defaults", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }).then(r => r.json())
      );
      setDefaultResult(result);
      api.admin.stats().then(setStats).catch(console.error);
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingDefaults(false);
    }
  };

  if (loading) return <div className="text-center py-8 text-gray-400">Loading dashboard...</div>;
  if (error) return <div className="max-w-4xl mx-auto"><div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div></div>;
  if (!stats) return <div className="text-center py-8 text-red-500">Failed to load stats</div>;

  const cards = [
    { label: "Total Users", value: stats.totalUsers, icon: Users, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
    { label: "KYC Verified", value: stats.kycVerified, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50 border-green-200" },
    { label: "Total Loans", value: stats.totalLoans, icon: FileText, color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200" },
    { label: "Pending Approval", value: stats.pendingLoans, icon: Clock, color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200" },
    { label: "KYC Reviews", value: stats.pendingKycReviews || 0, icon: Shield, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
    { label: "Active Loans", value: stats.activeLoans, icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
    { label: "Completed", value: stats.completedLoans, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50 border-green-200" },
    { label: "Defaulted", value: stats.defaultedLoans, icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
    { label: "Avg Credit Score", value: stats.avgCreditScore, icon: BarChart3, color: "text-cyan-600", bg: "bg-cyan-50 border-cyan-200" },
  ];

  const chartData = React.useMemo(() => {
    if (!analytics) return [];

    const disbursementMap = new Map((analytics.monthlyDisbursements || []).map((d: any) => [d.month, d.amount || 0]));
    const repaymentMap = new Map((analytics.monthlyRepayments || []).map((d: any) => [d.month, d.amount || 0]));
    const months = Array.from(new Set([
      ...getRecentMonths(6),
      ...disbursementMap.keys(),
      ...repaymentMap.keys(),
    ])).sort();

    return months.map((month) => ({
      month,
      disbursements: disbursementMap.get(month) || 0,
      repayments: repaymentMap.get(month) || 0,
    }));
  }, [analytics]);

  const statusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-100 text-green-800";
      case "completed": return "bg-blue-100 text-blue-800";
      case "defaulted": return "bg-red-100 text-red-800";
      case "created": return "bg-gray-100 text-gray-800";
      case "rejected": return "bg-orange-100 text-orange-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const formatAction = (action: string) => {
    return action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-500">System overview and analytics</p>
        </div>
        {stats?.blockchainMode && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            stats.blockchainMode === "ethereum_sepolia"
              ? "bg-green-100 text-green-700 border border-green-300"
              : "bg-gray-100 text-gray-600 border border-gray-300"
          }`}>
            <Blocks className="w-4 h-4" />
            {stats.blockchainMode === "ethereum_sepolia" ? "Ethereum Sepolia" : "Simulation Mode"}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`p-4 rounded-xl border ${bg}`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs font-medium text-gray-500">{label}</span>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {analytics && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              <h3 className="font-semibold text-gray-900">Analytics</h3>
            </div>
            <div className="flex gap-3">
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                Repayment Rate: {analytics.repaymentRate}%
              </span>
              <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                Default Rate: {analytics.defaultRate}%
              </span>
            </div>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: any) => `₹${Number(value).toLocaleString()}`} />
                <Legend />
                <Bar dataKey="disbursements" fill="#6366f1" name="Disbursements" />
                <Bar dataKey="repayments" fill="#22c55e" name="Repayments" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-400 py-8">No chart data available yet</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">Financial Summary</h3>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Total Disbursed</span>
              <span className="font-bold text-indigo-700">₹{(stats.totalDisbursed || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Total Repaid</span>
              <span className="font-bold text-green-600">₹{(stats.totalRepaid || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Outstanding</span>
              <span className="font-bold text-orange-600">₹{((stats.totalDisbursed || 0) - (stats.totalRepaid || 0)).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-3">Quick Actions</h3>
          <div className="space-y-2">
            <Link to="/admin/loans" className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg hover:bg-yellow-100 transition-colors">
              <span className="text-sm font-medium text-yellow-700">Review Pending Loans</span>
              <span className="px-2 py-0.5 bg-yellow-200 text-yellow-800 rounded-full text-xs font-bold">{stats.pendingLoans}</span>
            </Link>
            <Link to="/admin/users" className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
              <span className="text-sm font-medium text-blue-700">Manage Users</span>
              <span className="px-2 py-0.5 bg-blue-200 text-blue-800 rounded-full text-xs font-bold">{stats.totalUsers}</span>
            </Link>
            <Link to="/admin/kyc" className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">
              <span className="text-sm font-medium text-amber-700">Review KYC Queue</span>
              <span className="px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full text-xs font-bold">{stats.pendingKycReviews || 0}</span>
            </Link>
            <button
              onClick={handleCheckDefaults}
              disabled={checkingDefaults}
              className="w-full flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <span className="text-sm font-medium text-red-700">
                {checkingDefaults ? "Checking..." : "Run Default Detection"}
              </span>
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </button>
            {defaultResult && (
              <p className="text-xs text-gray-500 px-3">
                Checked {defaultResult.checked} loans, marked {defaultResult.marked} as defaulted
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-900">Contract Monitoring</h3>
        </div>
        {contracts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">ID</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Borrower</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Amount</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Contract Address</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Block #</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Events</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c: any) => {
                  const events = c.events ? JSON.parse(c.events) : [];
                  const hasOnChain = events.some((e: any) => e.onChain);
                  return (
                    <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 font-mono text-xs">{c.id}</td>
                      <td className="py-2 px-3">{c.user?.fullName || c.borrower}</td>
                      <td className="py-2 px-3">₹{c.amount?.toLocaleString()}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(c.status)}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-xs">
                        {c.contractAddress ? (
                          hasOnChain ? (
                            <a href={`https://sepolia.etherscan.io/address/${c.contractAddress}`} target="_blank" rel="noopener noreferrer"
                              className="text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-0.5">
                              {c.contractAddress.slice(0, 10)}...{c.contractAddress.slice(-6)}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span>{c.contractAddress.slice(0, 10)}...{c.contractAddress.slice(-6)}</span>
                          )
                        ) : "-"}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs">{c.blockNumber || "-"}</td>
                      <td className="py-2 px-3">{events.length}</td>
                      <td className="py-2 px-3 text-xs text-gray-500">
                        {c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-gray-400 py-4">No contracts found</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-900">Audit Trail</h3>
        </div>
        {auditLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Timestamp</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Action</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Entity</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">User ID</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log: any) => {
                  let details = "";
                  try {
                    const parsed = JSON.parse(log.details || "{}");
                    details = Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join(", ");
                  } catch {
                    details = log.details || "";
                  }
                  return (
                    <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-xs text-gray-500">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 px-3 font-medium">{formatAction(log.action)}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{log.entity}</span>
                      </td>
                      <td className="py-2 px-3">{log.userId || "-"}</td>
                      <td className="py-2 px-3 text-xs text-gray-600 max-w-xs truncate">{details}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-gray-400 py-4">No audit logs yet</p>
        )}
      </div>
    </div>
  );
}
