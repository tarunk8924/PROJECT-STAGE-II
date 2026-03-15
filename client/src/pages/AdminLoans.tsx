import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { FileText, CheckCircle, XCircle, Clock } from "lucide-react";

export default function AdminLoans() {
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  useEffect(() => {
    loadLoans();
  }, []);

  const loadLoans = async () => {
    try {
      const data = await api.admin.loans();
      setLoans(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (loanId: number) => {
    setActionLoading(loanId);
    try {
      await api.admin.approveLoan(loanId);
      await loadLoans();
    } catch (err: any) {
      alert(err.message || "Failed to approve loan");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (loanId: number) => {
    const reason = prompt("Rejection reason (optional):");
    setActionLoading(loanId);
    try {
      await api.admin.rejectLoan(loanId, reason || undefined);
      await loadLoans();
    } catch (err: any) {
      alert(err.message || "Failed to reject loan");
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = filter === "all" ? loans : loans.filter(l => l.status === filter);

  const statusCounts = {
    all: loans.length,
    pending: loans.filter(l => l.status === "pending").length,
    active: loans.filter(l => l.status === "active").length,
    completed: loans.filter(l => l.status === "completed").length,
    rejected: loans.filter(l => l.status === "rejected").length,
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manage Loans</h1>
        <p className="text-gray-500">Review and manage all loan applications</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {Object.entries(statusCounts).map(([key, count]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === key ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}>
            {key.charAt(0).toUpperCase() + key.slice(1)} ({count})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No loans found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(loan => (
            <div key={loan.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    loan.status === "pending" ? "bg-yellow-100" :
                    loan.status === "active" ? "bg-blue-100" :
                    loan.status === "completed" ? "bg-green-100" : "bg-red-100"
                  }`}>
                    {loan.status === "pending" ? <Clock className="w-5 h-5 text-yellow-600" /> :
                     loan.status === "completed" ? <CheckCircle className="w-5 h-5 text-green-600" /> :
                     loan.status === "active" ? <FileText className="w-5 h-5 text-blue-600" /> :
                     <XCircle className="w-5 h-5 text-red-600" />}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Loan #{loan.id} - ₹{loan.amount.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">
                      {loan.user?.fullName} ({loan.user?.email}) | Score: {loan.user?.creditScore} | Risk: {loan.user?.riskTier} | {loan.tenure} months @ {loan.interestRate}%
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    loan.reviewState === "under_review" ? "bg-amber-100 text-amber-700" :
                    loan.reviewState === "conditionally_approved" ? "bg-blue-100 text-blue-700" :
                    "bg-red-100 text-red-700"
                  }`}>{loan.reviewState?.replace(/_/g, " ")}</span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    loan.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                    loan.status === "active" ? "bg-blue-100 text-blue-700" :
                    loan.status === "completed" ? "bg-green-100 text-green-700" :
                    "bg-red-100 text-red-700"
                  }`}>{loan.status}</span>
                  {loan.status === "pending" && (
                    <>
                      <button onClick={() => handleApprove(loan.id)} disabled={actionLoading === loan.id}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
                        Approve
                      </button>
                      <button onClick={() => handleReject(loan.id)} disabled={actionLoading === loan.id}
                        className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_320px]">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-2">Admin Risk Notes</p>
                  <ul className="space-y-2 text-sm text-gray-600">
                    {(loan.riskNotes || []).map((note: string, index: number) => (
                      <li key={index} className="flex gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gray-500 shrink-0" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                  <p className="font-semibold text-gray-900 mb-2">Review Snapshot</p>
                  <div className="space-y-2 text-gray-600">
                    <p>KYC: <span className="font-medium text-gray-800">{loan.riskSummary?.kycStatus?.replace(/_/g, " ") || "pending"}</span></p>
                    <p>Bank Verification: <span className="font-medium text-gray-800">{loan.riskSummary?.bankVerified ? "verified" : "missing"}</span></p>
                    <p>Earnings Evidence: <span className="font-medium text-gray-800">{loan.riskSummary?.earningsEvidenceStatus?.replace(/_/g, " ") || "pending"}</span></p>
                    <p>Repayments: <span className="font-medium text-gray-800">{loan.riskSummary?.repaymentOnTime || 0} on time / {loan.riskSummary?.repaymentLate || 0} late</span></p>
                  </div>
                </div>
              </div>
              {loan.status === "active" && (
                <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                  <span>Repaid: ₹{(loan.amountRepaid || 0).toLocaleString()} / ₹{loan.totalDue.toLocaleString()}</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                    <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${Math.min(100, ((loan.amountRepaid || 0) / loan.totalDue) * 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
