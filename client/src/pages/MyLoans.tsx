import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { FileText, Clock, CheckCircle, XCircle, AlertTriangle, CreditCard } from "lucide-react";

export default function MyLoans() {
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.loans.my()
      .then(setLoans)
      .catch((err: any) => setError(err.message || "Failed to load loans"))
      .finally(() => setLoading(false));
  }, []);

  const statusConfig: Record<string, { icon: any; color: string; bg: string }> = {
    pending: { icon: Clock, color: "text-yellow-600", bg: "bg-yellow-100" },
    active: { icon: FileText, color: "text-blue-600", bg: "bg-blue-100" },
    completed: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-100" },
    rejected: { icon: XCircle, color: "text-red-600", bg: "bg-red-100" },
    defaulted: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-100" },
  };

  if (loading) return <div className="text-center py-8 text-gray-400">Loading loans...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Loans</h1>
          <p className="text-gray-500">{loans.length} total loan(s)</p>
        </div>
        <Link to="/apply-loan" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm transition-colors">
          Apply New Loan
        </Link>
      </div>

      {loans.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No loans yet</h3>
          <p className="text-gray-500 mb-4">Apply for your first micro-loan to get started.</p>
          <Link to="/apply-loan" className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
            Apply Now
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {loans.map(loan => {
            const config = statusConfig[loan.status] || statusConfig.pending;
            const StatusIcon = config.icon;
            const progress = loan.totalDue > 0 ? ((loan.amountRepaid || 0) / loan.totalDue) * 100 : 0;

            return (
              <Link key={loan.id} to={`/loans/${loan.id}`} className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center`}>
                      <StatusIcon className={`w-5 h-5 ${config.color}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">₹{loan.amount.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">{loan.purpose || "Personal Loan"} - {loan.tenure} months</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                      {loan.status.charAt(0).toUpperCase() + loan.status.slice(1)}
                    </span>
                    <p className="text-xs text-gray-500 mt-1">{new Date(loan.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                {loan.status === "active" && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>₹{(loan.amountRepaid || 0).toLocaleString()} repaid</span>
                      <span>₹{loan.totalDue.toLocaleString()} total</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, progress)}%` }} />
                    </div>
                    <div className="mt-2 flex justify-end">
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors">
                        <CreditCard className="w-3.5 h-3.5" /> Make Payment
                      </span>
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
