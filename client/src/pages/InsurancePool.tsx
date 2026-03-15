import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { ShieldCheck, TrendingUp, TrendingDown } from "lucide-react";

export default function InsurancePool() {
  const [balance, setBalance] = useState<number | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [balanceData, historyData] = await Promise.all([
        api.insurance.balance(),
        api.insurance.history(),
      ]);
      setBalance(balanceData.balance);
      setHistory(historyData);
    } catch (err: any) {
      setError(err.message || "Failed to load insurance pool data");
    } finally {
      setLoading(false);
    }
  };

  const totalContributions = history
    .filter((h) => h.type === "contribution")
    .reduce((sum, h) => sum + h.amount, 0);

  const totalPayouts = history
    .filter((h) => h.type === "claim")
    .reduce((sum, h) => sum + h.amount, 0);

  const netBalance = balance ?? 0;

  const cards = [
    {
      label: "Total Contributions",
      value: totalContributions,
      icon: TrendingUp,
      color: "text-green-600",
      bg: "bg-green-50 border-green-200",
    },
    {
      label: "Total Payouts",
      value: totalPayouts,
      icon: TrendingDown,
      color: "text-red-600",
      bg: "bg-red-50 border-red-200",
    },
    {
      label: "Net Balance",
      value: netBalance,
      icon: ShieldCheck,
      color: "text-indigo-600",
      bg: "bg-indigo-50 border-indigo-200",
    },
  ];

  if (loading)
    return (
      <div className="text-center py-8 text-gray-400">
        Loading insurance pool...
      </div>
    );
  if (error)
    return (
      <div className="max-w-4xl mx-auto">
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-7 h-7 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Insurance Pool</h1>
          <p className="text-gray-500">
            Monitor pool balance and transaction history
          </p>
        </div>
      </div>

      {/* Current Balance - Prominent Display */}
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-200 p-8">
        <p className="text-indigo-600 font-medium mb-2">Current Pool Balance</p>
        <h2 className="text-4xl font-bold text-indigo-900">
          ₹{netBalance.toLocaleString("en-IN", {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2,
          })}
        </h2>
        <p className="text-sm text-indigo-600 mt-2">
          Available for insurance claims
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`p-4 rounded-xl border ${bg}`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs font-medium text-gray-500">{label}</span>
            </div>
            <p className={`text-2xl font-bold ${color}`}>
              ₹
              {value.toLocaleString("en-IN", {
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
        ))}
      </div>

      {/* Transaction History Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-900">Pool Transactions</h3>
        </div>
        {history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">
                    Date
                  </th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">
                    Type
                  </th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">
                    Loan ID
                  </th>
                  <th className="text-right py-2 px-3 text-gray-500 font-medium">
                    Amount
                  </th>
                  <th className="text-right py-2 px-3 text-gray-500 font-medium">
                    Running Balance
                  </th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((transaction: any) => (
                  <tr
                    key={transaction.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-2 px-3 text-xs text-gray-500">
                      {new Date(transaction.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          transaction.type === "contribution"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {transaction.type === "contribution" ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {transaction.type === "contribution"
                          ? "Contribution"
                          : "Payout"}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-xs">
                      #{transaction.loanId}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-medium ${
                        transaction.type === "contribution"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {transaction.type === "contribution" ? "+" : "-"}₹
                      {transaction.amount.toLocaleString("en-IN", {
                        maximumFractionDigits: 2,
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-2 px-3 text-right text-indigo-600 font-medium">
                      ₹
                      {transaction.balance.toLocaleString("en-IN", {
                        maximumFractionDigits: 2,
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-600 max-w-xs truncate">
                      {transaction.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-gray-400 py-8">
            No pool transactions yet
          </p>
        )}
      </div>
    </div>
  );
}
