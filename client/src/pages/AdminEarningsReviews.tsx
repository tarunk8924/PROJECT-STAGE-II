import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { AlertTriangle, CheckCircle2, Clock3, Search, ShieldAlert, XCircle } from "lucide-react";

export default function AdminEarningsReviews() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [reason, setReason] = useState("Evidence appears acceptable for conditional approval.");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.admin.earningsEvidencePending();
      setItems(data);
      setSelected((current: any) => data.find((item: any) => item.id === current?.id) || data[0] || null);
    } catch (err: any) {
      setError(err.message || "Failed to load earnings evidence");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = items.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return item.fullName?.toLowerCase().includes(q) || item.email?.toLowerCase().includes(q) || item.platformUsername?.toLowerCase().includes(q);
  });

  const runReview = async (decision: "conditionally_approved" | "rejected") => {
    if (!selected) return;
    setActionLoading(true);
    setMessage("");
    setError("");
    try {
      const result = await api.admin.reviewEarningsEvidence(selected.id, { decision, reason });
      setMessage(result.message || "Evidence reviewed");
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to review evidence");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Earnings Evidence Review</h1>
          <p className="text-slate-500">Review screenshot OCR evidence before it influences lending decisions.</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <Clock3 className="w-4 h-4" />
          {items.length} evidence case{items.length === 1 ? "" : "s"}
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, username"
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-8 text-center text-slate-400">Loading evidence...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No earnings evidence pending review.</div>
            ) : filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className={`w-full text-left p-4 ${selected?.id === item.id ? "bg-indigo-50" : "hover:bg-slate-50"}`}
              >
                <p className="font-semibold text-slate-900">{item.fullName}</p>
                <p className="text-xs text-slate-500 mt-1">{item.email}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1">@{item.platformUsername}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1">{item.review?.status?.replace(/_/g, " ") || "under review"}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {!selected ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">Select an evidence case to review.</div>
          ) : (
            <>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Evidence #{selected.id}</p>
                    <h2 className="text-xl font-semibold text-slate-900 mt-1">{selected.fullName}</h2>
                    <p className="text-sm text-slate-500 mt-1">@{selected.platformUsername} · {selected.platform}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    selected.review?.status === "conditionally_approved" ? "bg-blue-100 text-blue-700" :
                    selected.review?.status === "rejected" ? "bg-rose-100 text-rose-700" :
                    "bg-amber-100 text-amber-700"
                  }`}>
                    {(selected.review?.status || "under_review").replace(/_/g, " ")}
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Earnings</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">₹{Number(selected.metrics?.totalEarnings || 0).toLocaleString()}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Confidence</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">{Math.round((selected.metrics?.confidence || 0) * 100)}%</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">AI Generated</p>
                    <p className={`mt-2 text-xl font-semibold ${selected.review?.aiGeneratedSuspected ? "text-rose-700" : "text-emerald-700"}`}>{selected.review?.aiGeneratedSuspected ? "Flagged" : "Clear"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Manipulation</p>
                    <p className={`mt-2 text-xl font-semibold ${selected.review?.manipulatedSuspected ? "text-rose-700" : "text-emerald-700"}`}>{selected.review?.manipulatedSuspected ? "Flagged" : "Clear"}</p>
                  </div>
                </div>

                {selected.metrics?.evidence?.length ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="font-semibold text-slate-900 mb-2">OCR Evidence</p>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
                      {selected.metrics.evidence.map((item: string, index: number) => <li key={index}>{item}</li>)}
                    </ul>
                  </div>
                ) : null}

                {(selected.review?.aiGeneratedSuspected || selected.review?.manipulatedSuspected) ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex gap-3">
                    <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Suspicion flags present</p>
                      <p className="mt-1">This evidence should not be treated as reliable until manually inspected and cross-checked.</p>
                    </div>
                  </div>
                ) : null}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Reviewer notes</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <button onClick={() => runReview("conditionally_approved")} disabled={actionLoading} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                    <CheckCircle2 className="w-4 h-4" />
                    Conditionally Approve
                  </button>
                  <button onClick={() => runReview("rejected")} disabled={actionLoading} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
