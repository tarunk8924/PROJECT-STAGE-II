import React, { useState, useEffect } from "react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import {
  Handshake,
  DollarSign,
  TrendingUp,
  Users,
  AlertTriangle,
  Check,
  X,
  Clock,
} from "lucide-react";

export default function P2PLending() {
  const { user } = useAuth();
  const [poolStats, setPoolStats] = useState<any>(null);
  const [availableLoans, setAvailableLoans] = useState<any[]>([]);
  const [myInvestments, setMyInvestments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fundingLoanId, setFundingLoanId] = useState<number | null>(null);
  const [fundAmount, setFundAmount] = useState("");
  const [fundLoading, setFundLoading] = useState(false);
  const [fundError, setFundError] = useState("");
  const [fundSuccess, setFundSuccess] = useState(false);

  // Load data on mount
  useEffect(() => {
    async function loadData() {
      try {
        setError("");
        const [stats, loans, investments] = await Promise.all([
          api.p2p.poolStats(),
          api.p2p.available(),
          api.p2p.myInvestments(),
        ]);
        setPoolStats(stats);
        setAvailableLoans(loans);
        setMyInvestments(investments);
      } catch (err: any) {
        setError(err.message || "Failed to load P2P data");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleFundLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundingLoanId || !fundAmount) return;

    const amount = parseFloat(fundAmount);
    if (amount <= 0) {
      setFundError("Amount must be greater than 0");
      return;
    }

    setFundLoading(true);
    setFundError("");
    try {
      await api.p2p.fund(fundingLoanId, amount);
      setFundSuccess(true);
      setFundAmount("");
      setFundingLoanId(null);

      // Reload data
      setTimeout(async () => {
        try {
          const [stats, loans, investments] = await Promise.all([
            api.p2p.poolStats(),
            api.p2p.available(),
            api.p2p.myInvestments(),
          ]);
          setPoolStats(stats);
          setAvailableLoans(loans);
          setMyInvestments(investments);
          setFundSuccess(false);
        } catch (err) {
          console.error("Failed to reload data:", err);
        }
      }, 1500);
    } catch (err: any) {
      setFundError(err.message || "Failed to fund loan");
    } finally {
      setFundLoading(false);
    }
  };

  const maskEmail = (email: string) => {
    const [name, domain] = email.split("@");
    return `${name.charAt(0)}***@${domain}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "committed":
        return { bg: "bg-yellow-100", text: "text-yellow-700", dot: "bg-yellow-500" };
      case "active":
        return { bg: "bg-blue-100", text: "text-blue-700", dot: "bg-blue-500" };
      case "repaid":
        return { bg: "bg-green-100", text: "text-green-700", dot: "bg-green-500" };
      case "defaulted":
        return { bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500" };
      default:
        return { bg: "bg-gray-100", text: "text-gray-700", dot: "bg-gray-500" };
    }
  };

  const canInvest = user && user.reputationScore >= 70;
  const totalInvested =
    myInvestments.reduce((sum, inv) => sum + (inv.amount || 0), 0) || 0;
  const activeInvestmentCount =
    myInvestments.filter((inv) => inv.status === "active").length || 0;
  const poolSize = poolStats?.totalPoolSize || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">Loading P2P data...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">P2P Lending</h1>
        <p className="text-gray-500">
          Invest in loans and earn returns from your community
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Reputation Check Alert */}
      {!canInvest && (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-orange-800">
              Higher Reputation Required
            </p>
            <p className="text-xs text-orange-600 mt-1">
              You need a reputation score of at least 70 to participate in P2P lending. Your current score is {user?.reputationScore || 0}.
            </p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-medium text-gray-600">
              Total Invested
            </span>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            ₹{totalInvested.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">Across {myInvestments.length} loan(s)</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-gray-600">
              Active Investments
            </span>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {activeInvestmentCount}
          </p>
          <p className="text-xs text-gray-500 mt-1">Currently earning</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-purple-600" />
            <span className="text-sm font-medium text-gray-600">Pool Size</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            ₹{poolSize.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">Total P2P pool</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Available Loans Section */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Handshake className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Available Loans</h2>
          </div>

          {!canInvest ? (
            <div className="text-center py-8">
              <AlertTriangle className="w-12 h-12 text-orange-300 mx-auto mb-3" />
              <p className="text-gray-600 font-medium mb-2">
                Higher Reputation Required
              </p>
              <p className="text-sm text-gray-500">
                You need a reputation score of 70 or higher to participate in P2P lending.
              </p>
            </div>
          ) : availableLoans.length === 0 ? (
            <div className="text-center py-8">
              <Handshake className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No available loans at this moment</p>
            </div>
          ) : (
            <div className="space-y-3">
              {availableLoans.map((loan) => (
                <div
                  key={loan.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        ₹{loan.amount.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {loan.purpose || "Personal Loan"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Borrower: {maskEmail(loan.borrowerEmail || "unknown@email.com")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-indigo-600">
                        {loan.interestRate || 12}%
                      </p>
                      <p className="text-xs text-gray-500">{loan.tenure || 6} months</p>
                    </div>
                  </div>

                  {fundingLoanId === loan.id ? (
                    <form
                      onSubmit={handleFundLoan}
                      className="mt-4 p-3 bg-gray-50 rounded-lg space-y-3"
                    >
                      {fundSuccess && (
                        <div className="p-2 bg-green-50 border border-green-200 text-green-700 text-xs rounded flex items-center gap-2">
                          <Check className="w-4 h-4" />
                          Loan funded successfully! Reloading...
                        </div>
                      )}

                      {fundError && (
                        <div className="p-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded flex items-center gap-2">
                          <X className="w-4 h-4" />
                          {fundError}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="Amount (₹)"
                          min="1"
                          step="1"
                          value={fundAmount}
                          onChange={(e) => setFundAmount(e.target.value)}
                          disabled={fundLoading || fundSuccess}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                        />
                        <button
                          type="submit"
                          disabled={fundLoading || fundSuccess || !fundAmount}
                          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                          {fundLoading ? "Funding..." : "Fund"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFundingLoanId(null);
                            setFundAmount("");
                            setFundError("");
                          }}
                          disabled={fundLoading || fundSuccess}
                          className="px-3 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      onClick={() => setFundingLoanId(loan.id)}
                      disabled={!canInvest}
                      className="w-full mt-3 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      Fund This Loan
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My Investments Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">My Investments</h2>
          </div>

          {myInvestments.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No investments yet</p>
              {canInvest && (
                <p className="text-xs text-gray-400 mt-2">
                  Fund a loan to start earning
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-600 grid grid-cols-4 gap-2 pb-2 border-b border-gray-200">
                <span>Loan ID</span>
                <span className="text-right">Amount</span>
                <span>Status</span>
                <span className="text-right text-gray-400">Date</span>
              </div>
              {myInvestments.map((inv) => {
                const colors = getStatusColor(inv.status);
                return (
                  <div
                    key={inv.id}
                    className="text-xs grid grid-cols-4 gap-2 py-2 border-b border-gray-100 last:border-b-0 items-center"
                  >
                    <span className="font-medium text-gray-900">#{inv.loanId}</span>
                    <span className="text-right font-medium text-gray-900">
                      ₹{(inv.amount || 0).toLocaleString()}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                      <span className={`${colors.text} font-medium capitalize`}>
                        {inv.status}
                      </span>
                    </div>
                    <span className="text-right text-gray-500">
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
