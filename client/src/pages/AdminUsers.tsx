import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { Users, Search, Shield, BarChart3 } from "lucide-react";

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.admin.users().then(setUsers).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(u =>
    u.role !== "admin" && (
      u.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const getScoreColor = (score: number) => {
    if (score === 0) return "text-gray-500";
    if (score >= 750) return "text-green-600";
    if (score >= 600) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">All Users</h1>
        <p className="text-gray-500">{filtered.length} registered users</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          placeholder="Search by name or email..." />
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No users found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 text-gray-500 font-medium">User</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Credit Score</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Risk</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Reputation</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">KYC</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Wallet</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Joined</th>
              </tr></thead>
              <tbody>
                {filtered.map(user => (
                  <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-gray-900">{user.fullName}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`font-bold ${getScoreColor(user.creditScore ?? 0)}`}>{(user.creditScore ?? 0) === 0 ? "Unscored" : user.creditScore}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.riskTier === "Low" ? "bg-green-100 text-green-700" :
                        user.riskTier === "High" ? "bg-red-100 text-red-700" :
                        "bg-yellow-100 text-yellow-700"
                      }`}>{user.riskTier || "Medium"}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-1.5">
                          <div className="bg-purple-600 h-1.5 rounded-full" style={{ width: `${user.reputationScore || 50}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{user.reputationScore || 50}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {user.isKycVerified ? (
                        <span className="flex items-center gap-1 text-green-600 text-xs"><Shield className="w-3 h-3" /> Verified</span>
                      ) : (
                        <span className="text-gray-400 text-xs">Pending</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium">₹{(user.walletBalance || 0).toLocaleString()}</td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{new Date(user.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
