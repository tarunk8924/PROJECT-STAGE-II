import React, { useState, useEffect } from "react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import {
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  AlertCircle,
  Percent,
  BarChart3,
} from "lucide-react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function BorrowerAnalytics() {
  const { user, refreshUser } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [allRepayments, setAllRepayments] = useState<any[]>([]);
  const [scoreHistory, setScoreHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const loansData = await api.loans.my();
      setLoans(loansData);

      // Fetch all repayments from all loans
      const allRepays: any[] = [];
      for (const loan of loansData) {
        try {
          const loanDetail = await api.loans.get(loan.id);
          if (loanDetail.repayments && loanDetail.repayments.length > 0) {
            allRepays.push(...loanDetail.repayments);
          }
        } catch (err) {
          // Continue if individual loan fetch fails
        }
      }
      setAllRepayments(allRepays);

      // Fetch score history as proxy for reputation history
      if (user) {
        const history = await api.score.history(user.id);
        setScoreHistory(history);
      }

      await refreshUser();
    } catch (err: any) {
      setError(err.message || "Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  };

  // Calculate metrics
  const totalRepaid = allRepayments.reduce((sum, r) => sum + r.amount, 0);
  const onTimePayments = allRepayments.filter((r) => r.isOnTime).length;
  const latePayments = allRepayments.filter((r) => !r.isOnTime).length;

  const reputation = user?.reputationScore || 50;
  let discountPercent = 0;
  if (reputation >= 90) discountPercent = 2;
  else if (reputation >= 80) discountPercent = 1;

  const estimatedSavings = loans.reduce((sum, loan) => {
    return sum + (loan.amount * discountPercent) / 100;
  }, 0);

  // Prepare chart data for repayment trends
  const repaymentsByDate = allRepayments
    .map((r) => ({
      date: new Date(r.paidAt).toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
      }),
      fullDate: new Date(r.paidAt),
      amount: r.amount,
    }))
    .sort((a, b) => a.fullDate.getTime() - b.fullDate.getTime());

  // Aggregate by date in case of multiple payments on same day
  const repaymentTrendMap = new Map<string, number>();
  repaymentsByDate.forEach((r) => {
    const existing = repaymentTrendMap.get(r.date) || 0;
    repaymentTrendMap.set(r.date, existing + r.amount);
  });

  const repaymentTrendData = Array.from(repaymentTrendMap.entries())
    .map(([date, amount]) => ({ date, amount }))
    .slice(-12); // Last 12 data points

  // Prepare reputation history chart data (using score history as proxy)
  const reputationChartData = scoreHistory
    .map((h) => ({
      date: new Date(h.calculatedAt).toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
      }),
      reputation: user?.reputationScore || 50, // Using current reputation for all points
    }))
    .reverse()
    .slice(-12);

  const getStatusColor = (
    status: string
  ): { bg: string; text: string; icon: string } => {
    switch (status) {
      case "active":
        return { bg: "bg-blue-50", text: "text-blue-700", icon: "text-blue-600" };
      case "completed":
        return {
          bg: "bg-green-50",
          text: "text-green-700",
          icon: "text-green-600",
        };
      case "pending":
        return {
          bg: "bg-yellow-50",
          text: "text-yellow-700",
          icon: "text-yellow-600",
        };
      default:
        return { bg: "bg-red-50", text: "text-red-700", icon: "text-red-600" };
    }
  };

  const calculateOnTimeRate = (loanId: number): number => {
    const loanRepayments = allRepayments.filter((r) => r.loanId === loanId);
    if (loanRepayments.length === 0) return 0;
    const onTime = loanRepayments.filter((r) => r.isOnTime).length;
    return Math.round((onTime / loanRepayments.length) * 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-500">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Borrower Analytics</h1>
        <p className="text-gray-500 mt-1">
          Your comprehensive financial performance overview
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Repaid */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-medium text-gray-600">Total Repaid</span>
          </div>
          <p className="text-3xl font-bold text-indigo-700">
            ₹{totalRepaid.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Across {allRepayments.length} payment(s)
          </p>
        </div>

        {/* On-Time Payments */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-gray-600">
              On-Time Payments
            </span>
          </div>
          <p className="text-3xl font-bold text-green-600">{onTimePayments}</p>
          <p className="text-xs text-gray-500 mt-1">
            {allRepayments.length > 0
              ? `${Math.round((onTimePayments / allRepayments.length) * 100)}% success rate`
              : "No payments yet"}
          </p>
        </div>

        {/* Late Payments */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-sm font-medium text-gray-600">
              Late Payments
            </span>
          </div>
          <p className="text-3xl font-bold text-red-600">{latePayments}</p>
          <p className="text-xs text-gray-500 mt-1">
            {allRepayments.length > 0
              ? `${Math.round((latePayments / allRepayments.length) * 100)}% late rate`
              : "No payments yet"}
          </p>
        </div>

        {/* Savings from Reputation */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Percent className="w-5 h-5 text-purple-600" />
            <span className="text-sm font-medium text-gray-600">
              Reputation Discount
            </span>
          </div>
          <p className="text-3xl font-bold text-purple-700">
            {discountPercent}%
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Est. savings: ₹{estimatedSavings.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Repayment Trend Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Repayment Trend
          </h2>
          {repaymentTrendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={repaymentTrendData}>
                <defs>
                  <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) =>
                    `₹${(value as number).toLocaleString("en-IN")}`
                  }
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#4f46e5"
                  fillOpacity={1}
                  fill="url(#colorAmount)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400">
              <p>No repayment data yet</p>
            </div>
          )}
        </div>

        {/* Reputation Score History */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Reputation Score History
          </h2>
          <div className="flex items-end gap-2 mb-4">
            <div>
              <p className="text-3xl font-bold text-purple-700">{reputation}</p>
              <p className="text-xs text-gray-500">Current score</p>
            </div>
          </div>
          {scoreHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={reputationChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => `${value}/100`} />
                <Line
                  type="monotone"
                  dataKey="reputation"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ fill: "#22c55e" }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-400">
              <p>No reputation history yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Loan Performance Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Loan Performance
        </h2>
        {loans.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No loans yet. Apply for a loan to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 text-gray-700 font-semibold">
                    Loan ID
                  </th>
                  <th className="text-left py-3 text-gray-700 font-semibold">
                    Amount
                  </th>
                  <th className="text-left py-3 text-gray-700 font-semibold">
                    Status
                  </th>
                  <th className="text-left py-3 text-gray-700 font-semibold">
                    Repaid
                  </th>
                  <th className="text-left py-3 text-gray-700 font-semibold">
                    Remaining
                  </th>
                  <th className="text-left py-3 text-gray-700 font-semibold">
                    On-Time Rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => {
                  const colors = getStatusColor(loan.status);
                  const remaining = loan.totalDue - (loan.amountRepaid || 0);
                  const onTimeRate = calculateOnTimeRate(loan.id);
                  const progress = Math.round(
                    ((loan.amountRepaid || 0) / loan.totalDue) * 100
                  );

                  return (
                    <tr key={loan.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3">
                        <span className="font-semibold text-gray-900">
                          #{loan.id}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className="font-medium text-gray-900">
                          ₹{loan.amount.toLocaleString("en-IN")}
                        </span>
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
                        >
                          {loan.status.charAt(0).toUpperCase() +
                            loan.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-3">
                        <div>
                          <p className="font-medium text-green-600">
                            ₹{(loan.amountRepaid || 0).toLocaleString("en-IN")}
                          </p>
                          <div className="mt-1 w-24 bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-indigo-600 h-1.5 rounded-full"
                              style={{ width: `${Math.min(100, progress)}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500">{progress}%</p>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="font-medium text-red-600">
                          ₹{remaining.toLocaleString("en-IN")}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <span
                            className={`font-semibold ${
                              onTimeRate === 100
                                ? "text-green-600"
                                : onTimeRate >= 80
                                  ? "text-yellow-600"
                                  : "text-red-600"
                            }`}
                          >
                            {onTimeRate}%
                          </span>
                          {onTimeRate === 100 && (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          )}
                          {onTimeRate < 100 && onTimeRate > 0 && (
                            <AlertCircle className="w-4 h-4 text-yellow-600" />
                          )}
                          {onTimeRate === 0 && (
                            <TrendingDown className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
