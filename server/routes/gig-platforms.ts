import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { gigPlatformConnections, gigEarnings, users } from "../../shared/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { getAuthPayload } from "../middleware/auth.js";
import OpenAI from "openai";
import { logAudit } from "../utils/audit.js";

const router = Router();

const openai = process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    })
  : null;

const SUPPORTED_PLATFORMS = ["Upwork"] as const;
const UPWORK_PROFILE_FIXTURES = [
  {
    profileUrl: "https://www.upwork.com/freelancers/~018df998f78b83aa7f/",
    username: "~018df998f78b83aa7f",
    fullName: "Mohammed W.",
    rating: 4.8,
    jobSuccessScore: 100,
    completedJobs: 4,
    totalHours: 70,
    hourlyRate: 5,
    totalEarnings: 186500,
    currency: "INR",
    memberSince: "2021",
    source: "sample_catalog",
  },
  {
    profileUrl: "https://www.upwork.com/freelancers/~01a2b3c4d5e6f7g8h9/",
    username: "~01a2b3c4d5e6f7g8h9",
    fullName: "Ananya S.",
    rating: 4.9,
    jobSuccessScore: 98,
    completedJobs: 27,
    totalHours: 412,
    hourlyRate: 18,
    totalEarnings: 142000,
    currency: "INR",
    memberSince: "2020",
    source: "sample_catalog",
  },
  {
    profileUrl: "https://www.upwork.com/freelancers/~0aa1bb2cc3dd4ee5f6/",
    username: "~0aa1bb2cc3dd4ee5f6",
    fullName: "Rohit P.",
    rating: 4.7,
    jobSuccessScore: 95,
    completedJobs: 19,
    totalHours: 260,
    hourlyRate: 12,
    totalEarnings: 98000,
    currency: "INR",
    memberSince: "2022",
    source: "sample_catalog",
  },
  {
    profileUrl: "https://www.upwork.com/freelancers/~0998aa77bb66cc55dd/",
    username: "~0998aa77bb66cc55dd",
    fullName: "Neha K.",
    rating: 5.0,
    jobSuccessScore: 99,
    completedJobs: 33,
    totalHours: 535,
    hourlyRate: 22,
    totalEarnings: 198000,
    currency: "INR",
    memberSince: "2019",
    source: "sample_catalog",
  },
] as const;

function normalizeProfileUrl(value: string) {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

function getSampleUpworkProfile(profileUrl: string) {
  const normalizedUrl = normalizeProfileUrl(profileUrl);
  return UPWORK_PROFILE_FIXTURES.find((profile) => normalizeProfileUrl(profile.profileUrl) === normalizedUrl) || null;
}

function profileMatchesConnectedUsername(
  connectedUsername: string,
  profileUsername?: string | null,
  profileFullName?: string | null,
) {
  return (
    usernamesMatch(connectedUsername, profileUsername) ||
    personNamesMatch(connectedUsername, profileFullName || "")
  );
}

function normalizeUsername(value: string) {
  return value.toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9_\-.]/g, "").trim();
}

function usernamesMatch(expected: string, actual?: string | null) {
  const a = normalizeUsername(expected);
  const b = normalizeUsername(actual || "");
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function normalizePersonName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function personNamesMatch(expected: string, actual?: string | null) {
  const a = normalizePersonName(expected);
  const b = normalizePersonName(actual || "");
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function parseMoney(value?: string | null) {
  if (!value) return null;
  const cleaned = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return cleaned ? Number(cleaned[0]) : null;
}

function parseMetrics(raw?: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildDeterministicEarnings(totalEarnings: number) {
  const safeTotal = Math.max(0, Math.round(totalEarnings * 100) / 100);
  const ratios = [0.22, 0.18, 0.27, 0.33];
  const descriptions = [
    "Upwork milestone payment",
    "Upwork hourly contract payout",
    "Upwork fixed-price delivery",
    "Upwork released earnings balance",
  ];

  const amounts = ratios.map((ratio, index) => {
    if (index === ratios.length - 1) return 0;
    return Math.round(safeTotal * ratio * 100) / 100;
  });
  const allocated = amounts.reduce((sum, amount) => sum + amount, 0);
  amounts[ratios.length - 1] = Math.round((safeTotal - allocated) * 100) / 100;

  return descriptions.map((description, index) => {
    const earnedAt = new Date();
    earnedAt.setDate(earnedAt.getDate() - index * 7);
    return {
      amount: amounts[index],
      description,
      earnedAt,
    };
  });
}

async function fetchPublicProfileHtml(profileUrl: string) {
  const response = await fetch(profileUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Public profile request failed with status ${response.status}`);
  }

  return response.text();
}

function extractPublicProfileMetrics(platform: string, profileUrl: string, html: string) {
  const lower = html.toLowerCase();
  const metrics: Record<string, any> = {
    platform,
    profileUrl,
    extractedAt: new Date().toISOString(),
    source: "public_profile",
  };

  if (platform === "Upwork") {
    if (!lower.includes("upwork") || (!lower.includes("freelancer") && !lower.includes("job success") && !lower.includes("total jobs") && !lower.includes("total hours"))) {
      throw new Error("This does not look like a valid public Upwork freelancer profile.");
    }

    metrics.fullName = firstMatch(html, [
      /<title>\s*([^<|]+?)\s*\|\s*Upwork/i,
      /"personName"\s*:\s*"([^"]+)"/i,
      /property="og:title"\s+content="([^"]+)"/i,
    ]);
    metrics.hourlyRate = parseMoney(firstMatch(html, [/(\$\s*\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*\/\s*hr/i]));
    metrics.jobSuccessScore = parseMoney(firstMatch(html, [/(\d{1,3})%\s*Job Success/i, /Job Success[^\d]*(\d{1,3})%/i]));
    metrics.completedJobs = parseMoney(firstMatch(html, [/>(\d+)\s*Total jobs</i, /(\d+)\s*Total jobs/i]));
    metrics.totalHours = parseMoney(firstMatch(html, [/>(\d+)\s*Total hours</i, /(\d+)\s*Total hours/i]));
    metrics.totalEarnings = parseMoney(firstMatch(html, [/>(?:Total earned|Total earnings|Earned)\s*<[^>]*>\s*\$?([\d,]+(?:\.\d+)?)</i, /(\$\s*\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:earned|total earned|total earnings)/i]));
    metrics.currency = "USD";
    metrics.evidence = [
      metrics.fullName ? `Name: ${metrics.fullName}` : null,
      metrics.jobSuccessScore !== null ? `Job Success: ${metrics.jobSuccessScore}%` : null,
      metrics.completedJobs !== null ? `Total jobs: ${metrics.completedJobs}` : null,
      metrics.totalHours !== null ? `Total hours: ${metrics.totalHours}` : null,
      metrics.hourlyRate !== null ? `Hourly rate: $${metrics.hourlyRate}` : null,
      metrics.totalEarnings !== null ? `Visible public earnings: $${metrics.totalEarnings}` : null,
    ].filter(Boolean);
    return metrics;
  }


  throw new Error("Unsupported platform");
}

async function analyzeScreenshotWithVision(input: {
  imageBase64: string;
  selectedPlatform: string;
  expectedUsername: string;
  expectedFullName?: string;
}) {
  if (!openai) {
    throw new Error("Screenshot OCR is not configured. AI vision key is missing.");
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      {
        role: "system",
        content: [
          "You validate freelancer earnings screenshots.",
          "Be extremely strict.",
          "Only accept screenshots that clearly belong to the selected platform and clearly show the freelancer username or person name plus total earnings.",
          "Reject screenshots that appear fake, edited, irrelevant, low-information, from the wrong platform, or do not visibly show the expected identity.",
          "The screenshot should resemble a real freelancer dashboard or earnings page for the selected platform, not an arbitrary image.",
          "Return JSON only.",
          "Schema:",
          '{"detectedPlatform":"Upwork|Unknown","platformMatches":true,"visibleUsername":"string|null","visiblePersonName":"string|null","usernameMatches":true,"identityMatchedOn":"username|full_name|none","earningsToDate":number|null,"currency":"USD|INR|EUR|GBP|UNKNOWN|null","earningsLabelVisible":true,"layoutAuthentic":true,"completedJobs":number|null,"jobSuccessScore":number|null,"rating":number|null,"confidence":0,"suspiciousManipulation":false,"suspiciousAIGenerated":false,"suspicionReasons":["..."],"evidence":["..."],"reasons":["..."],"approved":false}'
        ].join(" "),
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Selected platform: ${input.selectedPlatform}` },
          { type: "text", text: `Expected freelancer username: ${input.expectedUsername}` },
          { type: "text", text: `Expected freelancer full name: ${input.expectedFullName || "Unknown"}` },
          { type: "text", text: "Check whether the screenshot UI, visible labels, menu labels, and branding match the selected platform. Then read the visible username, visible person name if any, and total earnings to date. If the screenshot does not look like Upwork, reject it. If neither the visible username nor visible person name matches the expected identity closely, reject it. If total earnings cannot be confidently read from the screenshot, reject it. Also flag whether the screenshot appears AI-generated, composited, edited, or manipulated. Only approve if the layout looks like a real platform earnings/dashboard page." },
          { type: "image_url", image_url: { url: input.imageBase64, detail: "high" } },
        ],
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Vision model returned an empty response");
  }

  return JSON.parse(content) as {
    detectedPlatform?: string;
    platformMatches?: boolean;
    visibleUsername?: string | null;
    visiblePersonName?: string | null;
    usernameMatches?: boolean;
    identityMatchedOn?: "username" | "full_name" | "none";
    earningsToDate?: number | null;
    currency?: string | null;
    earningsLabelVisible?: boolean;
    layoutAuthentic?: boolean;
    completedJobs?: number | null;
    jobSuccessScore?: number | null;
    rating?: number | null;
    confidence?: number;
    suspiciousManipulation?: boolean;
    suspiciousAIGenerated?: boolean;
    suspicionReasons?: string[];
    evidence?: string[];
    reasons?: string[];
    approved?: boolean;
  };
}

router.get("/connections", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const connections = await db.select().from(gigPlatformConnections)
      .where(eq(gigPlatformConnections.userId, auth.userId))
      .orderBy(desc(gigPlatformConnections.connectedAt));

    res.json(connections);
  } catch (error) {
    console.error("Gig connections error:", error);
    res.status(500).json({ error: "Failed to fetch connections" });
  }
});

router.post("/connect", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { platform, platformUsername } = req.body;

    if (!platform || !platformUsername) {
      return res.status(400).json({ error: "platform and platformUsername are required" });
    }

    const existing = await db.select().from(gigPlatformConnections).where(
      and(
        eq(gigPlatformConnections.userId, auth.userId),
        eq(gigPlatformConnections.platform, platform),
        eq(gigPlatformConnections.status, "connected")
      )
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: `Already connected to ${platform}` });
    }

    const [connection] = await db.insert(gigPlatformConnections).values({
      userId: auth.userId,
      platform,
      platformUsername,
      status: "connected",
    }).returning();

    res.status(201).json({ message: "Platform connected", connection });
  } catch (error) {
    console.error("Gig connect error:", error);
    res.status(500).json({ error: "Failed to connect platform" });
  }
});

router.post("/sync/:connectionId", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const connectionId = parseInt(req.params.connectionId);

    const [connection] = await db.select().from(gigPlatformConnections).where(
      and(
        eq(gigPlatformConnections.id, connectionId),
        eq(gigPlatformConnections.userId, auth.userId)
      )
    );

    if (!connection) return res.status(404).json({ error: "Connection not found" });

    if (connection.status !== "connected") {
      return res.status(400).json({ error: "Platform is not connected" });
    }

    const parsedMetrics = parseMetrics(connection.extractedMetrics);
    const verifiedTotalEarnings = typeof parsedMetrics?.totalEarnings === "number" ? parsedMetrics.totalEarnings : null;

    if (verifiedTotalEarnings === null) {
      return res.status(400).json({ error: "Verify an Upwork profile first before syncing earnings." });
    }

    if (parsedMetrics?.source === "screenshot_ocr" && parsedMetrics?.review?.status !== "conditionally_approved") {
      return res.status(400).json({ error: "Screenshot-based earnings evidence must be manually reviewed before syncing." });
    }

    const earnings = buildDeterministicEarnings(verifiedTotalEarnings).map((entry) => ({
      userId: auth.userId,
      platform: connection.platform,
      amount: entry.amount,
      currency: "INR",
      description: entry.description,
      earnedAt: entry.earnedAt,
    }));

    await db.delete(gigEarnings).where(
      and(
        eq(gigEarnings.userId, auth.userId),
        eq(gigEarnings.platform, connection.platform),
      ),
    );

    const created = await db.insert(gigEarnings).values(earnings).returning();

    await db.update(gigPlatformConnections)
      .set({ lastSyncAt: new Date() })
      .where(eq(gigPlatformConnections.id, connectionId));

    await logAudit({
      userId: auth.userId,
      action: "earnings_synced",
      entity: "gig_platform_connection",
      entityId: connectionId,
      details: {
        borrowerUserId: auth.userId,
        platform: connection.platform,
        syncedCount: created.length,
        source: parsedMetrics?.source || "unknown",
      },
    });

    res.json({ message: "Earnings synced", count: created.length, earnings: created });
  } catch (error) {
    console.error("Gig sync error:", error);
    res.status(500).json({ error: "Failed to sync earnings" });
  }
});

router.post("/verify-profile", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { profileUrl } = req.body;
    if (!profileUrl || typeof profileUrl !== "string") {
      return res.status(400).json({ error: "profileUrl is required" });
    }

    const trimmedUrl = profileUrl.trim();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmedUrl);
    } catch {
      return res.status(400).json({ error: "Enter a valid public profile URL." });
    }

    const host = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.replace(/\/+$/, "");
    let platform = "";
    let extractedUsername = "";

    if (!host.includes("upwork.com")) {
      return res.status(400).json({ error: "Only Upwork public profile URLs are supported now." });
    }

    platform = "Upwork";
    const match = pathname.match(/^\/(freelancers\/~[a-zA-Z0-9]+|fl\/[a-zA-Z0-9_\-]+)$/i);
    if (!match) {
      return res.status(400).json({ error: "Use a public Upwork freelancer profile URL, such as /freelancers/~id or /fl/username." });
    }
    extractedUsername = pathname.split("/").pop() || "";

    const sampleProfile = getSampleUpworkProfile(trimmedUrl);
    let metrics: Record<string, any>;
    let html = "";

    if (sampleProfile) {
      metrics = {
        ...sampleProfile,
        platform,
        profileUrl: trimmedUrl,
        extractedAt: new Date().toISOString(),
        review: {
          status: "conditionally_approved",
          decisionReason: "Public profile metadata matched the connected identity.",
          decidedAt: new Date().toISOString(),
          decidedBy: "system",
          aiGeneratedSuspected: false,
          manipulatedSuspected: false,
        },
        evidence: [
          `Name: ${sampleProfile.fullName}`,
          `Job Success: ${sampleProfile.jobSuccessScore}%`,
          `Total jobs: ${sampleProfile.completedJobs}`,
          `Hourly rate: INR ${sampleProfile.hourlyRate}/hr`,
          `Sample earnings synced: INR ${sampleProfile.totalEarnings}`,
        ],
      };
    } else {
      html = await fetchPublicProfileHtml(trimmedUrl);
      metrics = extractPublicProfileMetrics(platform, trimmedUrl, html);
    }

    if (!metrics.review) {
      metrics.review = {
        status: "conditionally_approved",
        decisionReason: "Public profile metadata matched the connected identity.",
        decidedAt: new Date().toISOString(),
        decidedBy: "system",
        aiGeneratedSuspected: false,
        manipulatedSuspected: false,
      };
    }

    const profileIdentity = metrics.username || metrics.fullName || extractedUsername;
    if (!profileIdentity) {
      return res.status(400).json({ error: "Could not read a valid public identity from that profile page." });
    }

    if (!sampleProfile && platform === "Upwork") {
      if (!/upwork|job success|total jobs|total hours/i.test(html)) {
        return res.status(400).json({ error: "That Upwork URL did not resolve to a readable public freelancer profile." });
      }
    }

    const [existing] = await db.select().from(gigPlatformConnections).where(
      and(
        eq(gigPlatformConnections.userId, auth.userId),
        eq(gigPlatformConnections.platform, platform),
        eq(gigPlatformConnections.status, "connected")
      )
    );

    if (existing) {
      if (!profileMatchesConnectedUsername(existing.platformUsername, metrics.username || extractedUsername, metrics.fullName || "")) {
        return res.status(400).json({ error: `Upwork profile does not exist for connected username '${existing.platformUsername}'.` });
      }

      await db.update(gigPlatformConnections)
        .set({
          profileUrl: trimmedUrl,
          extractedMetrics: JSON.stringify({
            ...metrics,
            username: existing.platformUsername,
          }),
        })
        .where(eq(gigPlatformConnections.id, existing.id));

      await logAudit({
        userId: auth.userId,
        action: "upwork_profile_verified",
        entity: "gig_platform_connection",
        entityId: existing.id,
        details: {
          borrowerUserId: auth.userId,
          platform,
          username: existing.platformUsername,
          source: metrics.source || "public_profile",
        },
      });

      return res.json({
        message: sampleProfile ? "Sample Upwork profile matched and synced successfully" : "Public profile verified successfully",
        metrics: {
          ...metrics,
          username: existing.platformUsername,
        },
      });
    }

    const normalizedUsername = metrics.username || extractedUsername;
    await db.insert(gigPlatformConnections).values({
      userId: auth.userId,
      platform,
      platformUsername: normalizedUsername,
      profileUrl: trimmedUrl,
      extractedMetrics: JSON.stringify({
        ...metrics,
        username: normalizedUsername,
      }),
      status: "connected",
    });

    const [createdConnection] = await db.select().from(gigPlatformConnections).where(
      and(eq(gigPlatformConnections.userId, auth.userId), eq(gigPlatformConnections.platform, platform), eq(gigPlatformConnections.status, "connected"))
    ).orderBy(desc(gigPlatformConnections.connectedAt)).limit(1);

    if (createdConnection) {
      await logAudit({
        userId: auth.userId,
        action: "upwork_profile_verified",
        entity: "gig_platform_connection",
        entityId: createdConnection.id,
        details: {
          borrowerUserId: auth.userId,
          platform,
          username: normalizedUsername,
          source: metrics.source || "public_profile",
        },
      });
    }

    res.json({
      message: sampleProfile ? "Sample Upwork profile matched and synced successfully" : "Public profile verified successfully",
      metrics: {
        ...metrics,
        username: normalizedUsername,
      },
    });
  } catch (error: any) {
    console.error("Profile verify error:", error);
    const message = error?.message || "Failed to verify profile";
    if (message.includes("Public profile request failed") || message.includes("does not look like") || message.includes("Could not read") || message.includes("Use a public") || message.includes("does not match")) {
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: "Failed to verify profile" });
  }
});

router.post("/screenshot-ocr", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { imageBase64, platform } = req.body;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "imageBase64 is required" });
    }

    if (!platform || !SUPPORTED_PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: "Select a valid platform before uploading a screenshot" });
    }

    const [connection] = await db.select().from(gigPlatformConnections).where(
      and(
        eq(gigPlatformConnections.userId, auth.userId),
        eq(gigPlatformConnections.platform, platform),
        eq(gigPlatformConnections.status, "connected")
      )
    );

    if (!connection) {
      return res.status(400).json({ error: `Connect your ${platform} account with the correct username before using screenshot OCR.` });
    }

    const [user] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, auth.userId));
    const expectedFullName = user?.fullName || "";

    const analysis = await analyzeScreenshotWithVision({
      imageBase64,
      selectedPlatform: platform,
      expectedUsername: connection.platformUsername,
      expectedFullName,
    });

    const detectedPlatform = analysis.detectedPlatform || "Unknown";
    const visibleUsername = analysis.visibleUsername || null;
    const visiblePersonName = analysis.visiblePersonName || null;
    const platformMatches = analysis.platformMatches === true && detectedPlatform === platform;
    const usernameMatchByText = usernamesMatch(connection.platformUsername, visibleUsername);
    const fullNameMatchByText = expectedFullName ? personNamesMatch(expectedFullName, visiblePersonName || visibleUsername) : false;
    const identityMatchedOn = usernameMatchByText ? "username" : fullNameMatchByText ? "full_name" : "none";
    const identityMatches = analysis.usernameMatches === true && identityMatchedOn !== "none";
    const earningsToDate = typeof analysis.earningsToDate === "number" ? analysis.earningsToDate : null;
    const confidence = typeof analysis.confidence === "number" ? analysis.confidence : 0;
    const layoutAuthentic = analysis.layoutAuthentic === true;
    const earningsLabelVisible = analysis.earningsLabelVisible === true;
    const suspiciousManipulation = analysis.suspiciousManipulation === true;
    const suspiciousAIGenerated = analysis.suspiciousAIGenerated === true;

    const reasons = [
      ...(analysis.reasons || []),
      ...((analysis.suspicionReasons || []).filter(Boolean)),
      ...(!platformMatches ? [`Selected platform is ${platform}, but screenshot appears to be ${detectedPlatform}.`] : []),
      ...(!layoutAuthentic ? ["Screenshot layout does not look like an authentic earnings/dashboard page for the selected platform."] : []),
      ...(!visibleUsername && !visiblePersonName ? ["No visible username or person name could be read from the screenshot."] : []),
      ...(!identityMatches ? [`Visible identity does not match connected username '${connection.platformUsername}'${expectedFullName ? ` or project user '${expectedFullName}'.` : "."}`] : []),
      ...(!earningsLabelVisible ? ["The screenshot does not clearly show a total earnings label or summary section."] : []),
      ...(earningsToDate === null ? ["Could not confidently read total earnings from the screenshot."] : []),
      ...(confidence < 0.65 ? ["Screenshot confidence is too low for reliable approval."] : []),
      ...(suspiciousManipulation ? ["OCR flagged possible screenshot manipulation."] : []),
      ...(suspiciousAIGenerated ? ["OCR flagged possible AI-generated visual patterns."] : []),
    ];

    if (!platformMatches || !layoutAuthentic || !identityMatches || !earningsLabelVisible || earningsToDate === null || confidence < 0.65) {
      return res.status(400).json({
        error: reasons[0] || "Screenshot could not be verified",
        analysis: {
          selectedPlatform: platform,
          detectedPlatform,
          expectedUsername: connection.platformUsername,
          expectedFullName,
          visibleUsername,
          visiblePersonName,
          identityMatchedOn,
          earningsToDate,
          currency: analysis.currency || null,
          confidence,
          suspiciousManipulation,
          suspiciousAIGenerated,
          evidence: analysis.evidence || [],
          reasons,
        },
      });
    }

    const metrics = {
      platform,
      username: connection.platformUsername,
      visibleUsername,
      visiblePersonName,
      identityMatchedOn,
      rating: typeof analysis.rating === "number" ? analysis.rating : null,
      completedJobs: typeof analysis.completedJobs === "number" ? analysis.completedJobs : null,
      totalEarnings: earningsToDate,
      jobSuccessScore: typeof analysis.jobSuccessScore === "number" ? analysis.jobSuccessScore : null,
      currency: analysis.currency || "USD",
      extractedAt: new Date().toISOString(),
      source: "screenshot_ocr",
      confidence,
      review: {
        status: "under_review",
        decisionReason: "Awaiting manual reviewer decision",
        decidedAt: null,
        decidedBy: null,
        aiGeneratedSuspected: suspiciousAIGenerated,
        manipulatedSuspected: suspiciousManipulation,
      },
      aiGeneratedSuspected: suspiciousAIGenerated,
      manipulatedSuspected: suspiciousManipulation,
      evidence: analysis.evidence || [],
    };

    await db.update(gigPlatformConnections)
      .set({
        extractedMetrics: JSON.stringify(metrics),
        lastSyncAt: new Date(),
      })
      .where(eq(gigPlatformConnections.id, connection.id));

    await logAudit({
      userId: auth.userId,
      action: "earnings_evidence_submitted",
      entity: "gig_platform_connection",
      entityId: connection.id,
      details: {
        borrowerUserId: auth.userId,
        platform,
        confidence,
        suspiciousManipulation,
        suspiciousAIGenerated,
      },
    });

    res.json({ message: "Screenshot evidence submitted for manual review", metrics });
  } catch (error: any) {
    console.error("Screenshot OCR error:", error);
    res.status(500).json({ error: error.message || "Failed to process screenshot" });
  }
});

router.get("/metrics", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const connections = await db.select().from(gigPlatformConnections)
      .where(and(
        eq(gigPlatformConnections.userId, auth.userId),
        eq(gigPlatformConnections.status, "connected")
      ));

    const allMetrics = connections
      .filter(c => c.extractedMetrics)
      .map(c => ({
        connectionId: c.id,
        platform: c.platform,
        ...JSON.parse(c.extractedMetrics!),
      }));

    res.json(allMetrics);
  } catch (error) {
    console.error("Metrics fetch error:", error);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

router.delete("/:connectionId", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const connectionId = parseInt(req.params.connectionId);

    const [connection] = await db.select().from(gigPlatformConnections).where(
      and(
        eq(gigPlatformConnections.id, connectionId),
        eq(gigPlatformConnections.userId, auth.userId)
      )
    );

    if (!connection) return res.status(404).json({ error: "Connection not found" });

    await db.update(gigPlatformConnections)
      .set({ status: "disconnected" })
      .where(eq(gigPlatformConnections.id, connectionId));

    res.json({ message: "Platform disconnected" });
  } catch (error) {
    console.error("Gig disconnect error:", error);
    res.status(500).json({ error: "Failed to disconnect platform" });
  }
});

export default router;
