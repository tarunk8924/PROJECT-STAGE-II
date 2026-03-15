import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import {
  BadgeCheck,
  Camera,
  Clock3,
  FileImage,
  FileSearch,
  Mail,
  MapPinned,
  Phone,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCircle2,
  X,
  XCircle,
} from "lucide-react";

interface PendingKycRecord {
  id: number;
  userId: number;
  fullName: string;
  idType: string;
  idNumber: string;
  dateOfBirth?: string | null;
  address?: string | null;
  status: string;
  verificationMethod: string;
  createdAt: string;
  email: string;
  phone: string | null;
}

interface ReviewedDocument {
  id: number;
  docType: string;
  fileName: string;
  fileData: string;
  status: string;
  uploadedAt: string;
}

const METHOD_LABELS: Record<string, string> = {
  document_review: "Document Review",
  camera_capture: "Camera Capture",
  digilocker_ready: "DigiLocker-Ready",
};

const DOC_LABELS: Record<string, string> = {
  identity_front: "Government ID Front",
  identity_back: "Government ID Back",
  address_proof: "Address Proof",
  selfie_live: "Live Selfie",
  identity_face: "ID Face Crop",
  selfie_face: "Selfie Face Crop",
  biometric_report: "Biometric Report",
};

function toTitle(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function maskId(idNumber: string) {
  if (!idNumber) return "Not provided";
  if (idNumber.startsWith("PENDING-")) return "Pending manual review";
  if (idNumber.length <= 4) return idNumber;
  return `${"X".repeat(Math.max(0, idNumber.length - 4))}${idNumber.slice(-4)}`;
}

function resolveDocumentPreview(doc: ReviewedDocument) {
  const fileData = doc.fileData || "";
  const lowerName = doc.fileName.toLowerCase();

  if (fileData.startsWith("data:image/")) {
    return { kind: "image" as const, src: fileData };
  }

  if (fileData.startsWith("data:application/pdf")) {
    return { kind: "pdf" as const, src: fileData };
  }

  if (fileData.startsWith("data:")) {
    return { kind: "other" as const, src: fileData };
  }

  if (fileData) {
    if (lowerName.endsWith(".pdf")) {
      return { kind: "pdf" as const, src: `data:application/pdf;base64,${fileData}` };
    }
    if (lowerName.endsWith(".png")) {
      return { kind: "image" as const, src: `data:image/png;base64,${fileData}` };
    }
    if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
      return { kind: "image" as const, src: `data:image/jpeg;base64,${fileData}` };
    }
    if (lowerName.endsWith(".webp")) {
      return { kind: "image" as const, src: `data:image/webp;base64,${fileData}` };
    }
  }

  return { kind: "other" as const, src: fileData };
}

function parseBiometricReport(documents: ReviewedDocument[]) {
  const reportDoc = documents.find((doc) => doc.docType === "biometric_report");
  if (!reportDoc?.fileData?.startsWith("data:application/json")) return null;
  try {
    const [, encoded] = reportDoc.fileData.split(",");
    return JSON.parse(atob(encoded)) as {
      similarityScore: number;
      matchPassed: boolean;
      livenessPassed: boolean;
      livenessChecks: { challenge: string; motionScore: number; passed: boolean }[];
      detectionMethod: string;
      recommendation: string;
      generatedAt: string;
    };
  } catch {
    return null;
  }
}

function renderDocumentPreview(doc: ReviewedDocument, className: string) {
  const preview = resolveDocumentPreview(doc);

  if (preview.kind === "image") {
    return <img src={preview.src} alt={doc.fileName} className={className} />;
  }

  if (preview.kind === "pdf") {
    return <iframe src={preview.src} title={doc.fileName} className={className} />;
  }

  return (
    <div className="flex flex-col items-center gap-2 text-slate-500 px-4 text-center">
      <FileImage className="w-10 h-10" />
      <span className="text-sm">Preview unavailable for this file type</span>
    </div>
  );
}

function PreviewModal({ doc, onClose }: { doc: ReviewedDocument | null; onClose: () => void }) {
  if (!doc) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm p-4 flex items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-5xl rounded-3xl overflow-hidden bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Evidence Preview</p>
            <h3 className="text-lg font-semibold text-slate-900">{DOC_LABELS[doc.docType] || toTitle(doc.docType)}</h3>
            <p className="text-sm text-slate-500">{doc.fileName}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="bg-slate-100 max-h-[80vh] overflow-auto flex items-center justify-center p-4">
          <div className="w-full flex items-center justify-center min-h-[60vh]">
            {renderDocumentPreview(doc, "max-w-full h-auto min-h-[60vh] rounded-2xl bg-white shadow")}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminKycReviews() {
  const [records, setRecords] = useState<PendingKycRecord[]>([]);
  const [documents, setDocuments] = useState<ReviewedDocument[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ReviewedDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [docLoading, setDocLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rejectionReason, setRejectionReason] = useState("Document details are unclear. Please re-upload clear images and confirm profile data.");

  const loadQueue = async (preferredId?: number | null) => {
    setLoading(true);
    setError("");
    try {
      const pending = await api.admin.kycPending();
      setRecords(pending);
      if (pending.length === 0) {
        setSelectedId(null);
        setDocuments([]);
        return;
      }

      const candidateId = preferredId && pending.some((record: PendingKycRecord) => record.id === preferredId)
        ? preferredId
        : pending[0].id;
      setSelectedId(candidateId);
    } catch (err: any) {
      setError(err.message || "Failed to load KYC review queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDocuments([]);
      return;
    }

    setDocLoading(true);
    setError("");
    api.admin.kycDocuments(selectedId)
      .then(setDocuments)
      .catch((err: any) => setError(err.message || "Failed to load submitted KYC documents"))
      .finally(() => setDocLoading(false));
  }, [selectedId]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) =>
      record.fullName?.toLowerCase().includes(query) ||
      record.email?.toLowerCase().includes(query) ||
      record.phone?.toLowerCase().includes(query) ||
      record.idType?.toLowerCase().includes(query)
    );
  }, [records, search]);

  const selectedRecord = filteredRecords.find((record) => record.id === selectedId)
    || records.find((record) => record.id === selectedId)
    || null;

  const primaryIdDoc = useMemo(() => documents.find((doc) => doc.docType === "identity_front") || documents[0] || null, [documents]);
  const biometricReport = useMemo(() => parseBiometricReport(documents), [documents]);
  const secondaryDocs = useMemo(() => documents.filter((doc) => doc.id !== primaryIdDoc?.id), [documents, primaryIdDoc]);

  const runAction = async (action: "approve" | "reject") => {
    if (!selectedRecord) return;

    setActionLoading(true);
    setError("");
    setMessage("");
    try {
      if (action === "approve") {
        const result = await api.admin.approveKyc(selectedRecord.id);
        setMessage(result.message || "KYC approved successfully");
      } else {
        const result = await api.admin.rejectKyc(selectedRecord.id, rejectionReason.trim());
        setMessage(result.message || "KYC rejected successfully");
      }
      await loadQueue(selectedRecord.id);
    } catch (err: any) {
      setError(err.message || `Failed to ${action} KYC review`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">KYC Review Desk</h1>
            <p className="text-slate-500">Review submitted identity evidence, inspect uploaded artifacts, and approve or reject manually.</p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Clock3 className="w-4 h-4" />
            {records.length} case{records.length === 1 ? "" : "s"} waiting for review
          </div>
        </div>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {message && <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>}

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Manual Review Queue</p>
                <h2 className="text-lg font-semibold text-slate-900">Pending KYC Requests</h2>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name, email, phone, or document type"
                  className="w-full rounded-2xl border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-slate-400">Loading KYC queue...</div>
              ) : filteredRecords.length === 0 ? (
                <div className="p-10 text-center text-slate-500">
                  <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="font-medium text-slate-700">No pending KYC reviews</p>
                  <p className="text-sm text-slate-500 mt-1">New submissions will appear here once users send their identity package for review.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredRecords.map((record) => {
                    const active = record.id === selectedId;
                    return (
                      <button
                        key={record.id}
                        onClick={() => setSelectedId(record.id)}
                        className={`w-full text-left px-5 py-4 transition-colors ${active ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">{record.fullName}</p>
                            <p className="text-xs text-slate-500 mt-1 truncate">{record.email}</p>
                          </div>
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800 shrink-0">
                            {METHOD_LABELS[record.verificationMethod] || toTitle(record.verificationMethod)}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">{toTitle(record.idType)}</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">{record.phone || "No phone"}</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">Submitted {new Date(record.createdAt).toLocaleDateString()}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-6 min-w-0">
            {!selectedRecord ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
                <FileSearch className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="font-medium text-slate-700">Select a KYC request</p>
                <p className="text-sm mt-1">Choose a pending case from the review queue to inspect identity details and uploaded evidence.</p>
              </div>
            ) : (
              <>
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Case #{selectedRecord.id}</p>
                      <h2 className="text-2xl font-semibold text-slate-900 mt-1">{selectedRecord.fullName}</h2>
                      <p className="text-sm text-slate-500 mt-2">Submitted {new Date(selectedRecord.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 xl:max-w-sm">
                      <div className="flex items-center gap-2 font-medium"><ShieldAlert className="w-4 h-4" /> Manual reviewer checklist</div>
                      <p className="mt-2">Check that the live selfie, ID card, and address proof are legible and consistent before approval.</p>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-wide"><UserCircle2 className="w-4 h-4" /> Applicant</div>
                      <div className="mt-3 space-y-2 text-sm">
                        <p className="font-medium text-slate-900">User #{selectedRecord.userId}</p>
                        <p className="text-slate-600">{selectedRecord.fullName}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-wide"><Mail className="w-4 h-4" /> Contact</div>
                      <div className="mt-3 space-y-2 text-sm text-slate-600 break-words">
                        <p>{selectedRecord.email}</p>
                        <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 shrink-0" /> {selectedRecord.phone || "Not provided"}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-wide"><BadgeCheck className="w-4 h-4" /> Identity</div>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        <p className="font-medium text-slate-900">{toTitle(selectedRecord.idType)}</p>
                        <p>ID: {maskId(selectedRecord.idNumber)}</p>
                        <p>Mode: {METHOD_LABELS[selectedRecord.verificationMethod] || toTitle(selectedRecord.verificationMethod)}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-wide"><Camera className="w-4 h-4" /> Profile details</div>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        <p><span className="font-medium text-slate-900">DOB:</span> {selectedRecord.dateOfBirth || "Not provided"}</p>
                        <p><span className="font-medium text-slate-900">Status:</span> {toTitle(selectedRecord.status)}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-wide"><ShieldCheck className="w-4 h-4" /> Biometric review</div>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        <p><span className="font-medium text-slate-900">Face match:</span> {biometricReport ? `${biometricReport.similarityScore}%` : "Not generated"}</p>
                        <p><span className="font-medium text-slate-900">Liveness:</span> {biometricReport ? (biometricReport.livenessPassed ? "Passed" : "Failed") : "Not generated"}</p>
                        <p><span className="font-medium text-slate-900">Detection:</span> {biometricReport ? toTitle(biometricReport.detectionMethod) : "Not generated"}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:col-span-2 2xl:col-span-2">
                      <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-wide"><MapPinned className="w-4 h-4" /> Address</div>
                      <p className="mt-3 text-sm leading-6 text-slate-700 whitespace-pre-wrap break-words">{selectedRecord.address || "Address not provided in this submission."}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Evidence Vault</p>
                      <h3 className="text-lg font-semibold text-slate-900">Uploaded KYC Artifacts</h3>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {documents.length} file{documents.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {docLoading ? (
                    <div className="py-10 text-center text-slate-400">Loading uploaded documents...</div>
                  ) : documents.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
                      No KYC documents were found for this request.
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {biometricReport && (
                        <div className="rounded-3xl border border-indigo-200 bg-indigo-50 p-5">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                              <p className="text-xs uppercase tracking-[0.18em] text-indigo-500">Biometric Summary</p>
                              <h4 className="text-lg font-semibold text-slate-900 mt-1">Face match and liveness report</h4>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${biometricReport.matchPassed && biometricReport.livenessPassed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                              {biometricReport.recommendation === "ready_for_review" ? "Ready for review" : "Manual review required"}
                            </span>
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <div className="rounded-2xl bg-white p-4 border border-indigo-100">
                              <p className="text-xs uppercase tracking-wide text-slate-400">Similarity score</p>
                              <p className="mt-2 text-2xl font-semibold text-slate-900">{biometricReport.similarityScore}%</p>
                            </div>
                            <div className="rounded-2xl bg-white p-4 border border-indigo-100">
                              <p className="text-xs uppercase tracking-wide text-slate-400">Liveness result</p>
                              <p className="mt-2 text-2xl font-semibold text-slate-900">{biometricReport.livenessPassed ? "Passed" : "Failed"}</p>
                            </div>
                            <div className="rounded-2xl bg-white p-4 border border-indigo-100">
                              <p className="text-xs uppercase tracking-wide text-slate-400">Detection method</p>
                              <p className="mt-2 text-lg font-semibold text-slate-900">{toTitle(biometricReport.detectionMethod)}</p>
                            </div>
                          </div>
                          <div className="mt-4 rounded-2xl bg-white p-4 border border-indigo-100">
                            <p className="text-xs uppercase tracking-wide text-slate-400">Liveness checks</p>
                            <div className="mt-3 space-y-2">
                              {biometricReport.livenessChecks.map((check, index) => (
                                <div key={index} className="flex items-center justify-between gap-3 text-sm text-slate-600">
                                  <span>{check.challenge}</span>
                                  <span className={check.passed ? "text-emerald-700 font-medium" : "text-amber-700 font-medium"}>
                                    Motion {check.motionScore.toFixed(3)} · {check.passed ? "Pass" : "Review"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {primaryIdDoc && (
                        <article className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
                          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 flex-wrap">
                            <div>
                              <p className="font-medium text-slate-900">{DOC_LABELS[primaryIdDoc.docType] || toTitle(primaryIdDoc.docType)}</p>
                              <p className="text-xs text-slate-500">{primaryIdDoc.fileName}</p>
                            </div>
                            <button onClick={() => setPreviewDoc(primaryIdDoc)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                              Open Full Preview
                            </button>
                          </div>
                          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
                            <button className="min-h-[420px] bg-slate-100 flex items-center justify-center p-4" onClick={() => setPreviewDoc(primaryIdDoc)}>
                              {renderDocumentPreview(primaryIdDoc, "max-h-[390px] w-full object-contain rounded-2xl bg-white shadow")}
                            </button>
                            <div className="border-t lg:border-t-0 lg:border-l border-slate-200 bg-white p-5 space-y-3 text-sm text-slate-600">
                              <p><span className="font-medium text-slate-900">Document type:</span> {DOC_LABELS[primaryIdDoc.docType] || toTitle(primaryIdDoc.docType)}</p>
                              <p><span className="font-medium text-slate-900">Filename:</span> {primaryIdDoc.fileName}</p>
                              <p><span className="font-medium text-slate-900">Uploaded:</span> {new Date(primaryIdDoc.uploadedAt).toLocaleString()}</p>
                              <p><span className="font-medium text-slate-900">Status:</span> {toTitle(primaryIdDoc.status)}</p>
                              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-amber-800 text-sm">
                                Use this panel to inspect the primary government ID before comparing it with the selfie and address proof below.
                              </div>
                            </div>
                          </div>
                        </article>
                      )}

                      {secondaryDocs.length > 0 && (
                        <div className="grid gap-4 xl:grid-cols-2">
                          {secondaryDocs.map((doc) => (
                            <article key={doc.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
                              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                                <div className="min-w-0">
                                  <p className="font-medium text-slate-900">{DOC_LABELS[doc.docType] || toTitle(doc.docType)}</p>
                                  <p className="text-xs text-slate-500 truncate">{doc.fileName}</p>
                                </div>
                                <button onClick={() => setPreviewDoc(doc)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 shrink-0">
                                  Preview
                                </button>
                              </div>
                              <button className="aspect-[4/3] w-full bg-slate-100 flex items-center justify-center overflow-hidden p-3" onClick={() => setPreviewDoc(doc)}>
                                {renderDocumentPreview(doc, "h-full w-full object-contain rounded-2xl bg-white")}
                              </button>
                              <div className="px-4 py-3 text-xs text-slate-500 bg-white border-t border-slate-200">
                                Uploaded {new Date(doc.uploadedAt).toLocaleString()}
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Decision Console</p>
                    <h3 className="text-lg font-semibold text-slate-900">Approve or reject this KYC package</h3>
                  </div>
                  <textarea
                    value={rejectionReason}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    rows={4}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                    placeholder="Add a rejection reason or reviewer note"
                  />
                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <button
                      onClick={() => runAction("reject")}
                      disabled={actionLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" /> Reject Case
                    </button>
                    <button
                      onClick={() => runAction("approve")}
                      disabled={actionLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      <ShieldCheck className="w-4 h-4" /> Approve KYC
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
      <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </>
  );
}
