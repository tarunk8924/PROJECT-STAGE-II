import React, { useState, useEffect } from "react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { BarChart3, RefreshCw, TrendingUp, TrendingDown, AlertCircle, IndianRupee, Percent, CheckCircle, Shield, Briefcase, Wallet, Clock, Star } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface FactorBreakdown {
  name: string;
  weight: string;
  rawScore: number;
  weightedScore: number;
  explanation: string;
  impact: "positive" | "negative" | "neutral";
}

export default function CreditScore() {
  const { user, refreshUser } = useAuth();
  const [scoreData, setScoreData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      if (user) {
        const h = await api.score.history(user.id);
        setHistory(h);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load score history");
    }
  };

  const calculateScore = async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.score.get(user.id);
      setScoreData(data);
      await refreshUser();
      await loadHistory();
    } catch (err: any) {
      setError(err.message || "Failed to calculate score");
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score === 0) return "text-gray-400";
    if (score >= 750) return "text-green-600";
    if (score >= 600) return "text-yellow-600";
    return "text-red-600";
  };

  const getRiskBadge = (tier: string) => {
    const colors: Record<string, string> = {
      Low: "bg-green-100 text-green-700",
      Medium: "bg-yellow-100 text-yellow-700",
      High: "bg-red-100 text-red-700",
      Unscored: "bg-gray-100 text-gray-500",
    };
    return colors[tier] || colors.Medium;
  };

  const getFactorIcon = (name: string) => {
    if (name.includes("Earnings")) return <TrendingUp className="w-5 h-5" />;
    if (name.includes("Platform")) return <Star className="w-5 h-5" />;
    if (name.includes("Loan") || name.includes("Repayment")) return <IndianRupee className="w-5 h-5" />;
    if (name.includes("Work") || name.includes("Consistency")) return <Clock className="w-5 h-5" />;
    if (name.includes("Identity") || name.includes("Verification")) return <Shield className="w-5 h-5" />;
    return <BarChart3 className="w-5 h-5" />;
  };

  const getImpactColor = (impact: string) => {
    if (impact === "positive") return { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", bar: "bg-green-500", icon: "text-green-500" };
    if (impact === "negative") return { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", bar: "bg-red-500", icon: "text-red-500" };
    return { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", bar: "bg-yellow-500", icon: "text-yellow-500" };
  };

  const chartData = history.map(h => ({
    date: new Date(h.calculatedAt).toLocaleDateString(),
    score: h.score,
  })).reverse();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Credit Score</h1>
          <p className="text-gray-500">CIBIL-like credit analysis for freelancers & gig workers</p>
        </div>
        <button onClick={calculateScore} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Calculating..." : "Calculate Score"}
        </button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="col-span-1 bg-white rounded-xl border border-gray-200 p-6 text-center">
          <BarChart3 className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
          {(user?.creditScore || 0) === 0 ? (
            <>
              <p className="text-4xl font-bold text-gray-300">--</p>
              <p className="text-gray-500 text-sm mt-2">No Score Yet</p>
              <span className="mt-2 inline-block px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-500">
                Unscored
              </span>
              <p className="text-xs text-gray-400 mt-3">Add gig earnings, complete KYC, and verify UPI to build your credit score</p>
            </>
          ) : (
            <>
              <p className={`text-5xl font-bold ${getScoreColor(user?.creditScore || 0)}`}>{user?.creditScore}</p>
              <p className="text-gray-500 text-sm mt-2">Your Credit Score</p>
              <span className={`mt-2 inline-block px-3 py-1 rounded-full text-sm font-medium ${getRiskBadge(user?.riskTier || "Unscored")}`}>
                {user?.riskTier || "Unscored"} Risk
              </span>
              <div className="mt-4 w-full bg-gray-200 rounded-full h-3">
                <div className="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-3 rounded-full" style={{ width: `${((user?.creditScore || 0) - 300) / 6}%` }} />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>300</span><span>600</span><span>900</span>
              </div>
            </>
          )}
        </div>

        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Score History</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis domain={[300, 900]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2} dot={{ fill: "#4f46e5" }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400">
              <p>No score history yet. Click "Calculate Score" to start.</p>
            </div>
          )}
        </div>
      </div>

      {scoreData && scoreData.factorBreakdown && scoreData.factorBreakdown.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Score Factor Breakdown</h3>
          <p className="text-sm text-gray-500 mb-4">Your score is calculated using 5 weighted factors, similar to CIBIL scoring</p>
          <div className="space-y-4">
            {scoreData.factorBreakdown.map((factor: FactorBreakdown, i: number) => {
              const colors = getImpactColor(factor.impact);
              return (
                <div key={i} className={`p-4 rounded-lg border ${colors.bg} ${colors.border}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={colors.icon}>{getFactorIcon(factor.name)}</span>
                      <span className="font-semibold text-gray-900">{factor.name}</span>
                      <span className="text-xs px-2 py-0.5 bg-white/80 rounded-full text-gray-500 font-medium">
                        Weight: {factor.weight}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={`text-lg font-bold ${colors.text}`}>{factor.rawScore}/100</span>
                    </div>
                  </div>
                  <div className="w-full bg-white/60 rounded-full h-2.5 mb-2">
                    <div className={`h-2.5 rounded-full ${colors.bar} transition-all duration-500`} style={{ width: `${factor.rawScore}%` }} />
                  </div>
                  <p className={`text-sm ${colors.text}`}>{factor.explanation}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {scoreData && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Loan Eligibility</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <IndianRupee className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
              <p className="text-sm text-gray-500 mb-1">Recommended Loan Amount</p>
              <p className="text-2xl font-bold text-gray-900">
                ₹{(scoreData.recommendedLoanAmount || 0).toLocaleString("en-IN")}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <Percent className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
              <p className="text-sm text-gray-500 mb-1">Interest Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {scoreData.recommendedInterestRate || 0}% <span className="text-sm font-normal text-gray-500">per annum</span>
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <CheckCircle className={`w-8 h-8 mx-auto mb-2 ${
                (scoreData.approvalProbability || 0) >= 70 ? "text-green-500" :
                (scoreData.approvalProbability || 0) >= 40 ? "text-yellow-500" : "text-red-500"
              }`} />
              <p className="text-sm text-gray-500 mb-1">Approval Probability</p>
              <p className={`text-2xl font-bold ${
                (scoreData.approvalProbability || 0) >= 70 ? "text-green-600" :
                (scoreData.approvalProbability || 0) >= 40 ? "text-yellow-600" : "text-red-600"
              }`}>
                {scoreData.approvalProbability || 0}%
              </p>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5">
                <div className={`h-2.5 rounded-full ${
                  (scoreData.approvalProbability || 0) >= 70 ? "bg-green-500" :
                  (scoreData.approvalProbability || 0) >= 40 ? "bg-yellow-500" : "bg-red-500"
                }`} style={{ width: `${scoreData.approvalProbability || 0}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {scoreData && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Score Factors</h3>
          <div className="space-y-2">
            {scoreData.factors?.map((factor: string, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                {factor.toLowerCase().includes("default") || factor.toLowerCase().includes("late") || factor.toLowerCase().includes("negative") ? (
                  <TrendingDown className="w-5 h-5 text-red-500 mt-0.5" />
                ) : factor.toLowerCase().includes("new") || factor.toLowerCase().includes("limited") || factor.toLowerCase().includes("could") ? (
                  <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
                ) : (
                  <TrendingUp className="w-5 h-5 text-green-500 mt-0.5" />
                )}
                <span className="text-sm text-gray-700">{factor}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
