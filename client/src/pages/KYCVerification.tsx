import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import {
  AlertCircle,
  Camera,
  CheckCircle,
  ChevronRight,
  FileCheck2,
  FileText,
  ScanFace,
  ShieldCheck,
  Upload,
  UserCircle2,
  X,
} from "lucide-react";

interface UploadedDoc {
  id: number;
  docType: string;
  fileName: string;
  fileData?: string;
  status: string;
  uploadedAt: string;
}

interface DocState {
  fileName: string;
  dataUrl: string;
  uploading: boolean;
  error: string;
}

interface CapturePayload {
  dataUrl: string;
  livenessFrames?: string[];
  livenessChecks?: { challenge: string; motionScore: number; passed: boolean }[];
}

interface BiometricReport {
  similarityScore: number;
  matchPassed: boolean;
  livenessPassed: boolean;
  livenessChecks: { challenge: string; motionScore: number; passed: boolean }[];
  detectionMethod: string;
  recommendation: string;
  generatedAt: string;
}

const DOC_TYPES = [
  { key: "identity_front", label: "Government ID (Front)", required: true, hint: "PAN, Passport, Voter ID, or Aadhaar front" },
  { key: "identity_back", label: "Government ID (Back)", required: false, hint: "Back side if your document has address/details" },
  { key: "address_proof", label: "Address Proof", required: true, hint: "Utility bill, bank statement, rental agreement, or passport" },
  { key: "selfie_live", label: "Live Selfie", required: true, hint: "Capture a recent selfie for review" },
];

const METHOD_OPTIONS = [
  {
    key: "document_review",
    title: "Upload Documents",
    description: "Submit ID, address proof, and selfie for manual review.",
    accent: "from-blue-50 to-cyan-50 border-blue-200 text-blue-900",
  },
  {
    key: "camera_capture",
    title: "Capture With Camera",
    description: "Use your webcam to capture document images and live selfie.",
    accent: "from-amber-50 to-orange-50 border-amber-200 text-amber-900",
  },
  {
    key: "digilocker_ready",
    title: "DigiLocker-Ready",
    description: "Architecture-ready for future DigiLocker consent-based verification.",
    accent: "from-emerald-50 to-green-50 border-emerald-200 text-emerald-900",
  },
];

function toPrettyDocType(docType: string) {
  return docType.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

async function dataUrlToImage(dataUrl: string) {
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image"));
  });
  return img;
}

async function detectFaceBounds(dataUrl: string) {
  const FaceDetectorCtor = (window as any).FaceDetector;
  const image = await dataUrlToImage(dataUrl);
  if (FaceDetectorCtor) {
    try {
      const detector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 1 });
      const bitmap = await createImageBitmap(image);
      const faces = await detector.detect(bitmap);
      bitmap.close?.();
      const face = faces?.[0];
      if (face?.boundingBox) {
        return {
          x: face.boundingBox.x,
          y: face.boundingBox.y,
          width: face.boundingBox.width,
          height: face.boundingBox.height,
          method: "face_detector",
        };
      }
    } catch {
      // Fall through to heuristic crop.
    }
  }

  const width = image.width;
  const height = image.height;
  const cropWidth = width * 0.5;
  const cropHeight = height * 0.58;
  return {
    x: (width - cropWidth) / 2,
    y: (height - cropHeight) / 2.6,
    width: cropWidth,
    height: cropHeight,
    method: "center_crop",
  };
}

async function cropFace(dataUrl: string) {
  const image = await dataUrlToImage(dataUrl);
  const bounds = await detectFaceBounds(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 220;
  canvas.height = 220;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to initialize face crop canvas");
  ctx.drawImage(
    image,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return {
    faceDataUrl: canvas.toDataURL("image/jpeg", 0.9),
    method: bounds.method,
  };
}

async function toSignature(dataUrl: string, size = 32) {
  const image = await dataUrlToImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to initialize comparison canvas");
  ctx.drawImage(image, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const signature: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    signature.push((data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255);
  }
  return signature;
}

async function scoreSimilarity(idFace: string, selfieFace: string) {
  const [a, b] = await Promise.all([toSignature(idFace), toSignature(selfieFace)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff += Math.abs(a[i] - b[i]);
  }
  const averageDiff = diff / a.length;
  return Math.max(0, Math.min(100, Math.round((1 - averageDiff) * 100)));
}

async function scoreMotion(firstFrame: string, secondFrame: string) {
  const [a, b] = await Promise.all([toSignature(firstFrame, 24), toSignature(secondFrame, 24)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff += Math.abs(a[i] - b[i]);
  }
  return Number((diff / a.length).toFixed(3));
}

function CameraCaptureModal({
  open,
  label,
  mode,
  onClose,
  onCapture,
}: {
  open: boolean;
  label: string;
  mode: "document" | "selfie";
  onClose: () => void;
  onCapture: (payload: CapturePayload) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [captures, setCaptures] = useState<string[]>([]);

  const selfieChallenges = [
    "Look straight into the camera",
    "Turn your face slightly to the left",
    "Turn your face slightly to the right",
  ];

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError("");
    setChallengeIndex(0);
    setCaptures([]);
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err: any) => {
        setError(err?.message || "Unable to access camera");
      });

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [open]);

  if (!open) return null;

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.92);
  };

  const handleCapture = async () => {
    const frame = captureFrame();
    if (!frame) return;

    if (mode === "document") {
      onCapture({ dataUrl: frame });
      onClose();
      return;
    }

    const nextCaptures = [...captures, frame];
    if (challengeIndex < selfieChallenges.length - 1) {
      setCaptures(nextCaptures);
      setChallengeIndex((current) => current + 1);
      return;
    }

    const leftMotion = await scoreMotion(nextCaptures[0], nextCaptures[1]);
    const rightMotion = await scoreMotion(nextCaptures[0], nextCaptures[2]);
    const livenessChecks = [
      { challenge: selfieChallenges[1], motionScore: leftMotion, passed: leftMotion >= 0.045 },
      { challenge: selfieChallenges[2], motionScore: rightMotion, passed: rightMotion >= 0.045 },
    ];

    onCapture({
      dataUrl: nextCaptures[0],
      livenessFrames: nextCaptures,
      livenessChecks,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Camera Capture</p>
            <h3 className="text-xl font-semibold text-slate-900">{label}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error ? (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
          ) : (
            <>
              <div className="rounded-3xl overflow-hidden bg-slate-950 aspect-video border border-slate-200">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              </div>
              <p className="text-sm text-slate-500">
                {mode === "selfie"
                  ? `Challenge ${challengeIndex + 1} of ${selfieChallenges.length}: ${selfieChallenges[challengeIndex]}`
                  : "Make sure the frame is well-lit and the document or face is fully visible."}
              </p>
              {mode === "selfie" ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  We will capture three selfie frames and check that your face position changes across the liveness prompts.
                </div>
              ) : null}
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
          <button onClick={() => void handleCapture()} disabled={!!error} className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
            {mode === "selfie" && challengeIndex < selfieChallenges.length - 1 ? "Capture And Continue" : "Capture"}
          </button>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}

function KycArtifactManager({
  selectedMethod,
  onArtifactsChange,
  onBiometricChange,
}: {
  selectedMethod: string;
  onArtifactsChange: (docs: UploadedDoc[]) => void;
  onBiometricChange: (report: BiometricReport | null) => void;
}) {
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [docStates, setDocStates] = useState<Record<string, DocState>>({});
  const [loading, setLoading] = useState(true);
  const [cameraDocType, setCameraDocType] = useState<string | null>(null);
  const [biometricReport, setBiometricReport] = useState<BiometricReport | null>(null);
  const [biometricError, setBiometricError] = useState("");
  const [biometricRunning, setBiometricRunning] = useState(false);
  const [selfieChallengeState, setSelfieChallengeState] = useState<{ frames: string[]; checks: { challenge: string; motionScore: number; passed: boolean }[] } | null>(null);

  const refreshDocs = async (fallbackReport?: BiometricReport | null) => {
    try {
      const docs = await api.kyc.documents();
      setUploadedDocs(docs);
      onArtifactsChange(docs);
      const reportDoc = docs.find((doc: UploadedDoc) => doc.docType === "biometric_report" && doc.fileData?.startsWith("data:application/json"));
      if (reportDoc?.fileData) {
        const [, encoded] = reportDoc.fileData.split(",");
        const parsed = JSON.parse(atob(encoded)) as BiometricReport;
        setBiometricReport(parsed);
        onBiometricChange(parsed);
      } else if (fallbackReport) {
        setBiometricReport(fallbackReport);
        onBiometricChange(fallbackReport);
      }
      return docs;
    } catch (error) {
      console.error("Failed to fetch KYC documents", error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshDocs();
  }, []);

  const setDocData = (docType: string, dataUrl: string, fileName: string) => {
    setDocStates((prev) => ({
      ...prev,
      [docType]: { dataUrl, fileName, uploading: false, error: "" },
    }));
  };

  const handleFilePick = async (docType: string, file: File) => {
    if (file.size > 4 * 1024 * 1024) {
      setDocStates((prev) => ({
        ...prev,
        [docType]: { dataUrl: "", fileName: "", uploading: false, error: "File exceeds 4MB limit" },
      }));
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

    setDocData(docType, dataUrl, file.name);
  };

  const uploadDoc = async (docType: string) => {
    const state = docStates[docType];
    if (!state?.dataUrl) return;

    setDocStates((prev) => ({
      ...prev,
      [docType]: { ...prev[docType], uploading: true, error: "" },
    }));

    try {
      await api.kyc.uploadDocument({
        docType,
        fileName: state.fileName,
        fileData: state.dataUrl,
      });
      setDocStates((prev) => ({
        ...prev,
        [docType]: { dataUrl: "", fileName: "", uploading: false, error: "" },
      }));
      const docs = await refreshDocs();
      if ((docType === "identity_front" || docType === "selfie_live") && selfieChallengeState?.checks?.length) {
        const identityImage = docs.find((doc) => doc.docType === "identity_front")?.fileData || "";
        const selfieImage = docs.find((doc) => doc.docType === "selfie_live")?.fileData || "";
        if (identityImage && selfieImage) {
          await analyzeBiometrics({ identityImage, selfieImage });
        }
      }
    } catch (err: any) {
      setDocStates((prev) => ({
        ...prev,
        [docType]: { ...prev[docType], uploading: false, error: err.message || "Upload failed" },
      }));
    }
  };

  const uploadedMap = useMemo(() => new Map(uploadedDocs.map((doc) => [doc.docType, doc])), [uploadedDocs]);

  const getArtifactData = (docType: string) => docStates[docType]?.dataUrl || uploadedMap.get(docType)?.fileData || "";

  const analyzeBiometrics = async (sources?: { identityImage?: string; selfieImage?: string }) => {
    setBiometricError("");
    setBiometricRunning(true);
    try {
      const identityImage = sources?.identityImage || getArtifactData("identity_front");
      const selfieImage = sources?.selfieImage || getArtifactData("selfie_live");

      if (!identityImage || !selfieImage) {
        throw new Error("Upload the ID front and complete the live selfie capture before running face match.");
      }

      if (!selfieChallengeState?.checks?.length) {
        throw new Error("Complete the selfie liveness capture to generate the biometric report.");
      }

      const [{ faceDataUrl: identityFace, method: idMethod }, { faceDataUrl: selfieFace, method: selfieMethod }] = await Promise.all([
        cropFace(identityImage),
        cropFace(selfieImage),
      ]);
      const similarityScore = await scoreSimilarity(identityFace, selfieFace);
      const livenessPassed = selfieChallengeState.checks.every((check) => check.passed);
      const matchPassed = similarityScore >= 58;
      const report: BiometricReport = {
        similarityScore,
        matchPassed,
        livenessPassed,
        livenessChecks: selfieChallengeState.checks,
        detectionMethod: idMethod === selfieMethod ? idMethod : `${idMethod}+${selfieMethod}`,
        recommendation: matchPassed && livenessPassed ? "ready_for_review" : "manual_review_required",
        generatedAt: new Date().toISOString(),
      };

      const reportData = `data:application/json;base64,${btoa(JSON.stringify(report))}`;

      await Promise.all([
        api.kyc.uploadDocument({ docType: "identity_face", fileName: `identity-face-${Date.now()}.jpg`, fileData: identityFace }),
        api.kyc.uploadDocument({ docType: "selfie_face", fileName: `selfie-face-${Date.now()}.jpg`, fileData: selfieFace }),
        api.kyc.uploadDocument({ docType: "biometric_report", fileName: `biometric-report-${Date.now()}.json`, fileData: reportData }),
      ]);

      setBiometricReport(report);
      onBiometricChange(report);
      await refreshDocs(report);
    } catch (error: any) {
      setBiometricError(error.message || "Failed to generate biometric report");
    } finally {
      setBiometricRunning(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Step 2</p>
          <h2 className="text-xl font-semibold text-slate-900">KYC Artifacts</h2>
          <p className="text-sm text-slate-500 mt-1">Upload or capture the required documents and selfie before submitting for review.</p>
        </div>
        <div className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
          {selectedMethod === "camera_capture" ? "Camera-first flow" : "Upload or capture"}
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-400">Loading uploaded artifacts...</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        {DOC_TYPES.map((doc) => {
          const existing = uploadedMap.get(doc.key);
          const state = docStates[doc.key];
          return (
            <div key={doc.key} className="rounded-2xl border border-slate-200 p-4 bg-slate-50/70">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{doc.label}</h3>
                  <p className="text-xs text-slate-500 mt-1">{doc.hint}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${doc.required ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-600"}`}>
                  {doc.required ? "Required" : "Optional"}
                </span>
              </div>

              {existing ? (
                <div className="mt-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
                  <div className="flex items-center gap-2 font-medium"><CheckCircle className="w-4 h-4" /> Uploaded</div>
                  <p className="mt-1 text-emerald-800">{existing.fileName}</p>
                </div>
              ) : null}

              {state?.dataUrl ? (
                <div className="mt-3 space-y-3">
                  <img src={state.dataUrl} alt={doc.label} className="w-full h-40 object-cover rounded-2xl border border-slate-200 bg-white" />
                  <p className="text-xs text-slate-500">Ready to upload: {state.fileName}</p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {doc.key !== "selfie_live" ? (
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    Upload file
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleFilePick(doc.key, file);
                      }}
                    />
                  </label>
                ) : null}
                <button
                  type="button"
                  onClick={() => setCameraDocType(doc.key)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Camera className="w-4 h-4" /> Capture
                </button>
                <button
                  type="button"
                  onClick={() => void uploadDoc(doc.key)}
                  disabled={!state?.dataUrl || state.uploading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-50"
                >
                  {state?.uploading ? "Uploading..." : "Save artifact"}
                </button>
              </div>

              {state?.error ? <p className="mt-2 text-xs text-red-600">{state.error}</p> : null}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Step 2B</p>
            <h3 className="text-lg font-semibold text-slate-900">Biometric Check</h3>
            <p className="text-sm text-slate-500 mt-1">Extract faces from the ID and live selfie, generate a similarity score, and store the liveness report for the reviewer.</p>
          </div>
          <button
            type="button"
            onClick={() => void analyzeBiometrics()}
            disabled={biometricRunning}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <ScanFace className="w-4 h-4" />
            {biometricRunning ? "Analyzing..." : "Run Face Match"}
          </button>
        </div>

        {biometricError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{biometricError}</div> : null}

        {biometricReport ? (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-white border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Face Match</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{biometricReport.similarityScore}%</p>
              <p className="text-sm text-slate-500 mt-1">{biometricReport.matchPassed ? "Match threshold passed" : "Manual review required"}</p>
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Liveness</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{biometricReport.livenessPassed ? "Passed" : "Check failed"}</p>
              <p className="text-sm text-slate-500 mt-1">Based on multi-frame selfie movement</p>
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Detection</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{toPrettyDocType(biometricReport.detectionMethod)}</p>
              <p className="text-sm text-slate-500 mt-1">Stored with extracted face evidence</p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
            Run the biometric check after uploading the ID front and finishing the live selfie challenge.
          </div>
        )}
      </div>

      <CameraCaptureModal
        open={!!cameraDocType}
        label={cameraDocType ? toPrettyDocType(cameraDocType) : "Capture"}
        onClose={() => setCameraDocType(null)}
        mode={cameraDocType === "selfie_live" ? "selfie" : "document"}
        onCapture={(payload) => {
          if (!cameraDocType) return;
          setDocData(cameraDocType, payload.dataUrl, `${cameraDocType}-${Date.now()}.jpg`);
          if (cameraDocType === "selfie_live") {
            setSelfieChallengeState({
              frames: payload.livenessFrames || [],
              checks: payload.livenessChecks || [],
            });
          }
        }}
      />
    </div>
  );
}

function ReviewSubmission({
  uploadedDocs,
  biometricReport,
  status,
  onSubmitted,
}: {
  uploadedDocs: UploadedDoc[];
  biometricReport: BiometricReport | null;
  status: any;
  onSubmitted: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [method, setMethod] = useState("document_review");
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [idType, setIdType] = useState("aadhaar");
  const [idNumber, setIdNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const missingRequired = DOC_TYPES.filter((doc) => doc.required && !uploadedDocs.some((uploaded) => uploaded.docType === doc.key));
  const missingIdentityFields = [
    !fullName.trim() ? "Full Name" : null,
    !idType.trim() ? "Primary ID Type" : null,
    !idNumber.trim() ? "ID Number" : null,
    !dateOfBirth.trim() ? "Date of Birth" : null,
    !address.trim() ? "Address" : null,
  ].filter(Boolean) as string[];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (missingIdentityFields.length > 0) {
      setError(`Please fill all required identity fields: ${missingIdentityFields.join(", ")}`);
      return;
    }

    if (missingRequired.length > 0) {
      setError(`Please upload all required artifacts: ${missingRequired.map((doc) => doc.label).join(", ")}`);
      return;
    }

    if (!biometricReport) {
      setError("Run the biometric face match and liveness check before submitting for review.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.kyc.submitReview({
        idType,
        idNumber,
        fullName: fullName.trim(),
        dateOfBirth,
        address: address.trim(),
        verificationMethod: method,
        notes: notes || undefined,
      });
      setSuccess(result.message || "Submitted for review");
      await onSubmitted();
    } catch (err: any) {
      setError(err.message || "Failed to submit KYC review");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Step 3</p>
        <h2 className="text-xl font-semibold text-slate-900">Review Submission</h2>
        <p className="text-sm text-slate-500 mt-1">Choose a verification mode, provide identity details, and send the package for agent review.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {METHOD_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setMethod(option.key)}
            className={`text-left rounded-2xl border p-4 bg-gradient-to-br transition ${option.accent} ${method === option.key ? "ring-2 ring-slate-900/10 shadow-sm" : "opacity-80 hover:opacity-100"}`}
          >
            <p className="font-semibold">{option.title}</p>
            <p className="text-sm mt-1 opacity-80">{option.description}</p>
          </button>
        ))}
      </div>

      {status?.status === "under_review" ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm">
          Your KYC package is already under review. You can still update documents and resubmit if your reviewer requests changes.
        </div>
      ) : null}

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 text-sm">{success}</div> : null}

      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Full Name <span className="text-rose-500">*</span></label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:ring-2 focus:ring-slate-900/10 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Primary ID Type <span className="text-rose-500">*</span></label>
          <select value={idType} onChange={(e) => setIdType(e.target.value)} required className="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:ring-2 focus:ring-slate-900/10 outline-none">
            <option value="aadhaar">Aadhaar</option>
            <option value="pan">PAN</option>
            <option value="passport">Passport</option>
            <option value="voter_id">Voter ID</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">ID Number <span className="text-rose-500">*</span></label>
          <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} required placeholder="Masked or full number as per project policy" className="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:ring-2 focus:ring-slate-900/10 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth <span className="text-rose-500">*</span></label>
          <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required className="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:ring-2 focus:ring-slate-900/10 outline-none" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Address <span className="text-rose-500">*</span></label>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} required rows={3} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:ring-2 focus:ring-slate-900/10 outline-none" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Reviewer Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes about capture conditions, missing doc back side, etc." className="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:ring-2 focus:ring-slate-900/10 outline-none" />
        </div>
        <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 border border-slate-200 p-4">
          <div>
            <p className="font-medium text-slate-900">Artifacts ready: {uploadedDocs.length}</p>
            <p className="text-sm text-slate-500">Required left: {missingRequired.length === 0 && missingIdentityFields.length === 0 ? "None" : [...missingIdentityFields, ...missingRequired.map((doc) => doc.label)].join(", ")}</p>
            <p className="text-sm text-slate-500 mt-1">Biometric status: {biometricReport ? `${biometricReport.similarityScore}% match, ${biometricReport.livenessPassed ? "liveness passed" : "liveness failed"}` : "Pending biometric check"}</p>
          </div>
          <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
            <ShieldCheck className="w-4 h-4" />
            {submitting ? "Submitting..." : "Submit For Review"}
          </button>
        </div>
      </form>
    </div>
  );
}

function StatusBanner({ status }: { status: any }) {
  if (!status || status.status === "not_started") return null;

  const styles: Record<string, string> = {
    under_review: "bg-amber-50 border-amber-200 text-amber-800",
    conditionally_approved: "bg-blue-50 border-blue-200 text-blue-800",
    rejected: "bg-rose-50 border-rose-200 text-rose-800",
    verified: "bg-emerald-50 border-emerald-200 text-emerald-800",
    otp_sent: "bg-blue-50 border-blue-200 text-blue-800",
  };

  return (
    <div className={`rounded-3xl border p-5 ${styles[status.status] || "bg-slate-50 border-slate-200 text-slate-700"}`}>
      <div className="flex items-start gap-3">
        <FileCheck2 className="w-5 h-5 mt-0.5" />
        <div>
          <p className="font-semibold">Current KYC status: {toPrettyDocType(status.status)}</p>
          <p className="text-sm mt-1">
            {status.status === "under_review" && "Your KYC package has been submitted and is waiting for manual verification by an authorized reviewer."}
            {status.status === "conditionally_approved" && "Your KYC package cleared automated checks but still needs final reviewer confirmation."}
            {status.status === "rejected" && "Your previous submission was rejected. Update your details, fix the reviewer comments, and resubmit."}
            {status.status === "verified" && "Your identity package has been verified successfully."}
            {status.status === "otp_sent" && "An earlier phone-based flow is in progress. You can continue with the redesigned review workflow instead."}
          </p>
          {status.rejectionReason ? <p className="text-sm mt-2 font-medium">Reviewer note: {status.rejectionReason}</p> : null}
          {status.canResubmit && status.status === "rejected" ? <p className="text-xs mt-2 opacity-80">You can replace artifacts and submit a fresh review package from this page.</p> : null}
          {status.verificationMethod ? <p className="text-xs mt-2 opacity-80">Method: {toPrettyDocType(status.verificationMethod)}</p> : null}
        </div>
      </div>
    </div>
  );
}

export default function KYCVerification() {
  const { user } = useAuth();
  const [kycStatus, setKycStatus] = useState<any>(null);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [biometricReport, setBiometricReport] = useState<BiometricReport | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStatus = async () => {
    const status = await api.kyc.status();
    setKycStatus(status);
  };

  useEffect(() => {
    Promise.all([refreshStatus()])
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-8 text-slate-400">Loading KYC workspace...</div>;

  if (kycStatus?.isVerified || user?.isKycVerified) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="rounded-[2rem] bg-gradient-to-br from-emerald-100 via-white to-cyan-100 border border-emerald-200 p-8 shadow-sm">
          <div className="w-16 h-16 rounded-3xl bg-emerald-600 text-white flex items-center justify-center mb-5">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">KYC Approved</h1>
          <p className="text-slate-600 mt-2 max-w-2xl">Your identity package has passed review. You can now use verified borrower features across the platform.</p>
          <div className="grid gap-3 md:grid-cols-3 mt-6">
            <div className="rounded-2xl bg-white/80 border border-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Applicant</p>
              <p className="font-semibold text-slate-900 mt-2">{kycStatus?.fullName || user?.fullName}</p>
            </div>
            <div className="rounded-2xl bg-white/80 border border-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Method</p>
              <p className="font-semibold text-slate-900 mt-2">{toPrettyDocType(kycStatus?.verificationMethod || "manual_review")}</p>
            </div>
            <div className="rounded-2xl bg-white/80 border border-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Verified On</p>
              <p className="font-semibold text-slate-900 mt-2">{kycStatus?.verifiedAt ? new Date(kycStatus.verifiedAt).toLocaleDateString() : "Today"}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className="rounded-[2rem] overflow-hidden border border-slate-200 bg-white shadow-sm">
        <div className="px-8 py-8 bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.9),_rgba(59,130,246,0.92)_55%,_rgba(16,185,129,0.78))] text-white">
          <p className="text-xs uppercase tracking-[0.22em] text-white/70">Identity Workspace</p>
          <div className="mt-3 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">KYC Review Pipeline</h1>
              <p className="text-white/80 mt-2 max-w-2xl">Capture documents, add a live selfie, and submit your identity package for manual review. The architecture is future-ready for DigiLocker, OCR, and advanced fraud modules.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 min-w-[260px]">
              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm border border-white/10">
                <Upload className="w-4 h-4 text-white/90" />
                <p className="text-sm font-medium mt-3">Docs</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm border border-white/10">
                <Camera className="w-4 h-4 text-white/90" />
                <p className="text-sm font-medium mt-3">Camera</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm border border-white/10">
                <UserCircle2 className="w-4 h-4 text-white/90" />
                <p className="text-sm font-medium mt-3">Review</p>
              </div>
            </div>
          </div>
        </div>
        <div className="px-8 py-5 bg-slate-50 border-t border-slate-200">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span className="inline-flex items-center gap-2"><ChevronRight className="w-4 h-4" /> Phone verification handled during onboarding</span>
            <span className="inline-flex items-center gap-2"><ChevronRight className="w-4 h-4" /> Document review by agent/admin</span>
            <span className="inline-flex items-center gap-2"><ChevronRight className="w-4 h-4" /> Future-ready for DigiLocker and OCR modules</span>
          </div>
        </div>
      </section>

      <StatusBanner status={kycStatus} />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-6">
            <div className="flex items-start gap-3">
              <ScanFace className="w-6 h-6 text-slate-900 mt-1" />
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Step 1</p>
                <h2 className="text-xl font-semibold text-slate-900">Applicant Readiness</h2>
                <p className="text-sm text-slate-500 mt-1">Review the checklist before submitting your identity package.</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 mt-5">
              <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50">
                <p className="text-sm font-medium text-slate-900">Registered Mobile</p>
                <p className="text-sm text-slate-500 mt-1">{user?.phone ? `Verified via onboarding: +91 ${user.phone}` : "No mobile on file. Complete phone verification during registration first."}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50">
                <p className="text-sm font-medium text-slate-900">Review Standards</p>
                <p className="text-sm text-slate-500 mt-1">Make sure all captures are clear, unedited, and recent. Blurry or cropped submissions are likely to be rejected.</p>
              </div>
            </div>
          </div>

          <KycArtifactManager
            selectedMethod={kycStatus?.verificationMethod || "document_review"}
            onArtifactsChange={setUploadedDocs}
            onBiometricChange={setBiometricReport}
          />
        </div>

        <div className="space-y-6">
          <ReviewSubmission uploadedDocs={uploadedDocs} biometricReport={biometricReport} status={kycStatus} onSubmitted={refreshStatus} />

          <div className="rounded-3xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-slate-700" />
              <h3 className="font-semibold text-slate-900">Project Integrity Notes</h3>
            </div>
            <ul className="space-y-3 text-sm text-slate-600">
              <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-500" />This workflow supports document upload, camera capture, and manual reviewer approval.</li>
              <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-500" />Architecture supports future integration for AI-based document validation, liveness checks, and NFC-assisted verification.</li>
              <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-500" />DigiLocker and provider-based eKYC can be added later without redesigning the core KYC state machine.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
