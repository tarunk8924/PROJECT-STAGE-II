import React, { useState, useEffect, useRef } from "react";
import { api } from "../lib/api";
import { DollarSign, Globe, RefreshCw, TrendingUp, Briefcase, Upload, Download, FileText, CheckCircle, AlertCircle, Search, Camera, Star, Award, ExternalLink } from "lucide-react";

interface PlatformConnection {
  id: number;
  platform: string;
  platformUsername: string;
  status: "connected" | "disconnected";
  connectedAt: string;
  lastSyncAt?: string;
}
function formatCurrency(amount?: number | null, currency = "USD") {
  if (typeof amount !== "number") return "Not detected";
  const symbol = currency === "INR" ? "₹" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  return `${symbol}${amount.toLocaleString()}`;
}

export default function Earnings() {
  const [earnings, setEarnings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [syncingId, setSyncingId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<{ message: string; earningsCreated: number; usersCreated: number; skipped: number; errors: string[] } | null>(null);
  const [csvError, setCsvError] = useState("");

  const [profileUrl, setProfileUrl] = useState("");
  const [profileVerifying, setProfileVerifying] = useState(false);
  const [profileMetrics, setProfileMetrics] = useState<any>(null);
  const [profileError, setProfileError] = useState("");

  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const [screenshotPlatform, setScreenshotPlatform] = useState("Upwork");
  const [screenshotUploading, setScreenshotUploading] = useState(false);
  const [screenshotMetrics, setScreenshotMetrics] = useState<any>(null);
  const [screenshotAnalysis, setScreenshotAnalysis] = useState<any>(null);
  const [screenshotError, setScreenshotError] = useState("");

  const [allMetrics, setAllMetrics] = useState<any[]>([]);

  useEffect(() => {
    loadEarnings();
    loadConnections();
    loadMetrics();
  }, []);

  const loadConnections = async () => {
    try {
      const data = await api.gigPlatforms.connections();
      setConnections(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadEarnings = async () => {
    try {
      const data = await api.earnings.getGig();
      setEarnings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (connectionId: number) => {
    setSyncingId(connectionId);
    try {
      await api.gigPlatforms.sync(connectionId);
      await loadConnections();
      await loadEarnings();
    } catch (err: any) {
      console.error(err.message || "Failed to sync earnings");
    } finally {
      setSyncingId(null);
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      setCsvError("Please upload a .csv file");
      return;
    }

    setCsvUploading(true);
    setCsvError("");
    setCsvResult(null);

    try {
      const text = await file.text();
      const result = await api.earnings.csvUpload(text);
      setCsvResult(result);
      await loadEarnings();
    } catch (err: any) {
      setCsvError(err.message || "Failed to upload CSV");
    } finally {
      setCsvUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const loadMetrics = async () => {
    try {
      const data = await api.gigPlatforms.metrics();
      setAllMetrics(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleVerifyProfile = async () => {
    if (!profileUrl.trim()) return;
    setProfileVerifying(true);
    setProfileError("");
    setProfileMetrics(null);
    try {
      const result = await api.gigPlatforms.verifyProfile(profileUrl.trim());
      setProfileMetrics(result.metrics);
      await loadConnections();
      await loadMetrics();
    } catch (err: any) {
      setProfileError(err.message || "Failed to verify profile");
    } finally {
      setProfileVerifying(false);
    }
  };

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setScreenshotError("Please upload an image file");
      return;
    }

    setScreenshotUploading(true);
    setScreenshotError("");
    setScreenshotMetrics(null);
    setScreenshotAnalysis(null);

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const result = await api.gigPlatforms.screenshotOcr(base64, screenshotPlatform);
      setScreenshotMetrics(result.metrics);
      setScreenshotAnalysis({
        detectedPlatform: result.metrics.platform,
        visibleUsername: result.metrics.visibleUsername || result.metrics.username,
        visiblePersonName: result.metrics.visiblePersonName || null,
        identityMatchedOn: result.metrics.identityMatchedOn || "username",
        earningsToDate: result.metrics.totalEarnings,
        currency: result.metrics.currency || "USD",
        confidence: result.metrics.confidence || 0,
        evidence: result.metrics.evidence || [],
        reasons: [],
      });
      await loadConnections();
      await loadMetrics();
    } catch (err: any) {
      setScreenshotAnalysis(err.details?.analysis || null);
      setScreenshotError(err.message || "Failed to process screenshot");
    } finally {
      setScreenshotUploading(false);
      if (screenshotInputRef.current) screenshotInputRef.current.value = "";
    }
  };

  const connectedPlatforms = connections.filter(c => c.status === "connected");
  const connectedCount = connectedPlatforms.length;
  const connectedPlatformNames = new Set(connectedPlatforms.map(c => c.platform));
  const screenshotConnection = connections.find(c => c.platform === screenshotPlatform && c.status === "connected");
  const verifiedUpworkConnection = connections.find(c => c.platform === "Upwork" && c.status === "connected");

  const connectedEarnings = earnings.filter(e => connectedPlatformNames.has(e.platform));
  const metricsBreakdown = allMetrics.reduce((acc: Record<string, number>, metric: any) => {
    if (typeof metric.totalEarnings === "number") {
      acc[metric.platform] = metric.totalEarnings;
    }
    return acc;
  }, {});
  const totalEarnings = Object.values(metricsBreakdown).reduce((sum, amount) => sum + amount, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gig Platform Earnings</h1>
        <p className="text-gray-500">Verify your Upwork profile, submit earnings evidence, and sync only after review-safe checks pass.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <Briefcase className="w-5 h-5 text-indigo-600" />
            <span className="text-sm text-gray-500">Verified Profiles</span>
          </div>
          <p className="text-2xl font-bold text-indigo-600">{connectedCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <span className="text-sm text-gray-500">Total Earnings</span>
          </div>
          <p className="text-2xl font-bold text-green-600">&#8377;{totalEarnings.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-5 h-5 text-purple-600" />
            <span className="text-sm text-gray-500">Total Entries</span>
          </div>
          <p className="text-2xl font-bold text-purple-600">{connectedEarnings.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-2">
          <Search className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-900">Verify Freelancer Profile</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Paste your public Upwork freelancer profile URL to extract visible profile metrics.
        </p>

        <div className="flex gap-3">
          <input
            type="url"
            value={profileUrl}
            onChange={(e) => setProfileUrl(e.target.value)}
            placeholder="https://www.upwork.com/freelancers/~yourprofile"
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
          />
          <button
            onClick={handleVerifyProfile}
            disabled={profileVerifying || !profileUrl.trim()}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm font-medium flex items-center gap-2 whitespace-nowrap"
          >
            {profileVerifying ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Verifying...</>
            ) : (
              <><ExternalLink className="w-4 h-4" /> Verify Profile</>
            )}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <span className="text-xs text-gray-400">Supported:</span>
          <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded">upwork.com/freelancers/~username</span>
        </div>

        {profileError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{profileError}</p>
          </div>
        )}

        {profileMetrics && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <p className="font-medium text-green-800">Profile Verified — {profileMetrics.platform}</p>
              </div>
              {verifiedUpworkConnection ? (
                <button
                  onClick={() => handleSync(verifiedUpworkConnection.id)}
                  disabled={syncingId === verifiedUpworkConnection.id}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${syncingId === verifiedUpworkConnection.id ? "animate-spin" : ""}`} />
                  {syncingId === verifiedUpworkConnection.id ? "Syncing..." : "Sync Earnings"}
                </button>
              ) : null}
            </div>
            {profileMetrics.review?.status ? (
              <div className="mb-3 inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                Review state: {profileMetrics.review.status.replace(/_/g, " ")}
              </div>
            ) : null}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-white rounded-lg p-3 text-center">
                <Star className="w-4 h-4 text-yellow-500 mx-auto mb-1" />
                <p className="font-bold text-gray-900">{profileMetrics.rating}/5.0</p>
                <p className="text-gray-500 text-xs">Rating</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center">
                <Award className="w-4 h-4 text-indigo-500 mx-auto mb-1" />
                <p className="font-bold text-gray-900">{profileMetrics.jobSuccessScore}%</p>
                <p className="text-gray-500 text-xs">Job Success</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center">
                <Briefcase className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                <p className="font-bold text-gray-900">{profileMetrics.completedJobs}</p>
                <p className="text-gray-500 text-xs">Completed Jobs</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center">
                <DollarSign className="w-4 h-4 text-green-500 mx-auto mb-1" />
                <p className="font-bold text-gray-900">{formatCurrency(profileMetrics.totalEarnings, profileMetrics.currency || "INR")}</p>
                <p className="text-gray-500 text-xs">Total Earnings</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">Username: @{profileMetrics.username} · Member since {profileMetrics.memberSince} · Data stored for credit scoring</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-2">
          <Camera className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-900">Screenshot OCR — Extract Earnings</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Upload a real dashboard or earnings screenshot for the selected platform. OCR screens it first, then a reviewer decides whether the evidence is acceptable for lending.
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="text-sm font-medium text-gray-700">Platform:</label>
          <select
            value={screenshotPlatform}
            onChange={(e) => setScreenshotPlatform(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
          >
            <option value="Upwork">Upwork</option>
          </select>
          {screenshotConnection ? (
            <span className="text-xs px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full">
              Expected username: @{screenshotConnection.platformUsername}
            </span>
          ) : (
            <span className="text-xs px-3 py-1 bg-amber-50 text-amber-700 rounded-full">
              Verify your {screenshotPlatform} profile first before uploading a screenshot
            </span>
          )}
        </div>

        <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${screenshotConnection ? "border-gray-300 hover:border-indigo-400" : "border-amber-300 bg-amber-50/40"}`}>
          <input
            ref={screenshotInputRef}
            type="file"
            accept="image/*"
            onChange={handleScreenshotUpload}
            className="hidden"
            id="screenshot-upload"
            disabled={!screenshotConnection}
          />
          <Camera className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          {screenshotUploading ? (
            <div className="space-y-2">
              <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mx-auto" />
              <p className="text-sm text-gray-600">Processing screenshot with OCR...</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-1">
                Upload a screenshot of your earnings dashboard
              </p>
              <p className="text-xs text-gray-400 mb-3">
                Supports PNG, JPG, WEBP. Wrong platform screenshots, missing usernames, and unreadable earnings are rejected.
              </p>
              <label
                htmlFor="screenshot-upload"
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg transition-colors text-sm font-medium ${screenshotConnection ? "bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer" : "bg-gray-200 text-gray-500 cursor-not-allowed"}`}
              >
                <Upload className="w-4 h-4" />
                Upload Screenshot
              </label>
            </>
          )}
        </div>

        {screenshotError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div className="text-sm text-red-700 space-y-2">
              <p>{screenshotError}</p>
              {screenshotAnalysis?.reasons?.length > 0 && (
                <ul className="list-disc pl-5 space-y-1 text-xs text-red-700">
                  {screenshotAnalysis.reasons.map((reason: string, idx: number) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {screenshotMetrics && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="font-medium text-green-800">Screenshot Evidence Submitted — {screenshotMetrics.platform}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                screenshotMetrics.review?.status === "conditionally_approved" ? "bg-blue-100 text-blue-700" :
                screenshotMetrics.review?.status === "rejected" ? "bg-rose-100 text-rose-700" :
                "bg-amber-100 text-amber-700"
              }`}>
                {String(screenshotMetrics.review?.status || "under_review").replace(/_/g, " ")}
              </span>
              {screenshotMetrics.review?.aiGeneratedSuspected ? <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">AI-generated suspected</span> : null}
              {screenshotMetrics.review?.manipulatedSuspected ? <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">Manipulation suspected</span> : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="bg-white rounded-lg p-4">
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Matched identity</p>
                <p className="font-semibold text-gray-900">@{screenshotMetrics.username}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Matched on {screenshotMetrics.identityMatchedOn === "full_name" ? "project full name" : "platform username"}
                </p>
                {screenshotMetrics.visibleUsername && (
                  <p className="text-xs text-gray-500 mt-1">Visible username: {screenshotMetrics.visibleUsername}</p>
                )}
                {screenshotMetrics.visiblePersonName && (
                  <p className="text-xs text-gray-500">Visible name: {screenshotMetrics.visiblePersonName}</p>
                )}
              </div>
              <div className="bg-white rounded-lg p-4">
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Total earnings scanned</p>
                <p className="text-2xl font-bold text-green-700">{formatCurrency(screenshotMetrics.totalEarnings, screenshotMetrics.currency)}</p>
                <p className="text-xs text-gray-500 mt-1">Read directly from the uploaded screenshot</p>
              </div>
              <div className="bg-white rounded-lg p-4">
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Review confidence</p>
                <p className="text-2xl font-bold text-indigo-700">{Math.round((screenshotMetrics.confidence || 0) * 100)}%</p>
                <p className="text-xs text-gray-500 mt-1">Used as reviewer guidance, not final proof by itself</p>
              </div>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              OCR result is not auto-approved. The evidence now waits for manual reviewer decision before it should influence lending.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              {typeof screenshotMetrics.rating === "number" && (
                <div className="bg-white rounded-lg p-3 text-center">
                  <Star className="w-4 h-4 text-yellow-500 mx-auto mb-1" />
                  <p className="font-bold text-gray-900">{screenshotMetrics.rating}/5.0</p>
                  <p className="text-gray-500 text-xs">Rating</p>
                </div>
              )}
              {typeof screenshotMetrics.jobSuccessScore === "number" && (
                <div className="bg-white rounded-lg p-3 text-center">
                  <Award className="w-4 h-4 text-indigo-500 mx-auto mb-1" />
                  <p className="font-bold text-gray-900">{screenshotMetrics.jobSuccessScore}%</p>
                  <p className="text-gray-500 text-xs">Job Success</p>
                </div>
              )}
              {typeof screenshotMetrics.completedJobs === "number" && (
                <div className="bg-white rounded-lg p-3 text-center">
                  <Briefcase className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                  <p className="font-bold text-gray-900">{screenshotMetrics.completedJobs}</p>
                  <p className="text-gray-500 text-xs">Completed Jobs</p>
                </div>
              )}
            </div>

            {screenshotMetrics.evidence?.length > 0 && (
              <div className="bg-white rounded-lg p-4">
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Evidence read from screenshot</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
                  {screenshotMetrics.evidence.map((item: string, idx: number) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {allMetrics.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Extracted Freelancer Metrics</h2>
          </div>
          <div className="space-y-3">
            {allMetrics.map((m: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold bg-green-500`}>
                    {m.platform.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{m.platform}</p>
                    <p className="text-xs text-gray-400">@{m.username} {m.source === "screenshot_ocr" ? "· via Screenshot" : "· via Profile URL"}</p>
                    {m.source === "screenshot_ocr" && m.visibleUsername && (
                      <p className="text-xs text-gray-400">Visible username: {m.visibleUsername}</p>
                    )}
                    {m.review?.status ? (
                      <p className="text-xs text-gray-500 mt-1">Review: {m.review.status.replace(/_/g, " ")}{m.review?.decisionReason ? ` · ${m.review.decisionReason}` : ""}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  {typeof m.rating === "number" && (
                    <div className="text-center">
                      <p className="font-bold text-yellow-600">{m.rating}★</p>
                      <p className="text-xs text-gray-400">Rating</p>
                    </div>
                  )}
                  {typeof m.jobSuccessScore === "number" && (
                    <div className="text-center">
                      <p className="font-bold text-indigo-600">{m.jobSuccessScore}%</p>
                      <p className="text-xs text-gray-400">Success</p>
                    </div>
                  )}
                  {typeof m.completedJobs === "number" && (
                    <div className="text-center">
                      <p className="font-bold text-blue-600">{m.completedJobs}</p>
                      <p className="text-xs text-gray-400">Jobs</p>
                    </div>
                  )}
                  <div className="text-center">
                    <p className="font-bold text-green-600">{formatCurrency(m.totalEarnings, m.currency)}</p>
                    <p className="text-xs text-gray-400">Earned</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Import Earnings from CSV</h2>
          </div>
          <a
            href={api.earnings.csvTemplate()}
            download
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <Download className="w-4 h-4" />
            Download Template
          </a>
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-indigo-400 transition-colors">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCsvUpload}
            className="hidden"
            id="csv-upload"
          />
          <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          {csvUploading ? (
            <div className="space-y-2">
              <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mx-auto" />
              <p className="text-sm text-gray-600">Processing CSV file...</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-1">
                Upload a CSV file with gig earnings data
              </p>
              <p className="text-xs text-gray-400 mb-3">
                Required columns: platform, amount, earned_at. Optional: user_name, email, currency, description
              </p>
              <label
                htmlFor="csv-upload"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                Choose CSV File
              </label>
            </>
          )}
        </div>

        {csvError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{csvError}</p>
          </div>
        )}

        {csvResult && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="font-medium text-green-800">Import Complete</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-white rounded-lg p-2 text-center">
                <p className="font-bold text-green-700">{csvResult.earningsCreated}</p>
                <p className="text-gray-500 text-xs">Earnings Added</p>
              </div>
              <div className="bg-white rounded-lg p-2 text-center">
                <p className="font-bold text-indigo-700">{csvResult.usersCreated}</p>
                <p className="text-gray-500 text-xs">Users Created</p>
              </div>
              <div className="bg-white rounded-lg p-2 text-center">
                <p className="font-bold text-yellow-700">{csvResult.skipped}</p>
                <p className="text-gray-500 text-xs">Rows Skipped</p>
              </div>
            </div>
            {csvResult.errors.length > 0 && (
              <div className="mt-3 text-xs text-red-600 space-y-1">
                {csvResult.errors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Synced Earnings</h3>
          <span className="text-xs text-gray-400">{connectedEarnings.length} entries</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : connectedCount === 0 ? (
          <div className="p-12 text-center">
            <Globe className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No verified profiles yet</p>
            <p className="text-gray-400 text-sm mt-1">Verify your Upwork profile above to see synced earnings here.</p>
          </div>
        ) : connectedEarnings.length === 0 ? (
          <div className="p-12 text-center">
            <Globe className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No earnings synced yet</p>
            <p className="text-gray-400 text-sm mt-1">Use the sync action on your verified Upwork profile to import earnings.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Date</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Platform</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Description</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium">Amount</th>
              </tr></thead>
              <tbody>
                {connectedEarnings.map(e => (
                  <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">{new Date(e.earnedAt).toLocaleDateString()}</td>
                    <td className="py-3 px-4"><span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-medium">{e.platform}</span></td>
                    <td className="py-3 px-4 text-gray-600">{e.description || "-"}</td>
                    <td className="py-3 px-4 text-right font-medium text-green-600">&#8377;{e.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
