import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "../db.js";
import { users } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import { getAuthPayload, signToken, requireAuth } from "../middleware/auth.js";
import { OAuth2Client } from "google-auth-library";
import jwksClient from "jwks-rsa";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { getFirebaseConfig, isFirebaseConfigured, verifyFirebaseIdToken } from "../utils/firebaseAdmin.js";
import { logAudit } from "../utils/audit.js";
import { getBorrowerTrustSummary, getUserTimeline } from "../utils/trust.js";

const router = Router();

const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.ethereal.email",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
});

const isEmailConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

async function sendOtpEmail(email: string, otp: string, fullName: string): Promise<boolean> {
  if (!isEmailConfigured) {
    console.log(`[DEMO MODE] Email OTP for ${email}: ${otp}`);
    return true;
  }
  try {
    await emailTransporter.sendMail({
      from: process.env.SMTP_FROM || '"MicroCredit" <noreply@microcredit.com>',
      to: email,
      subject: "MicroCredit - Email Verification OTP",
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px">
        <h2 style="color:#4338ca">MicroCredit Email Verification</h2>
        <p>Hello ${fullName},</p>
        <p>Your OTP for account verification is:</p>
        <div style="background:#f3f4f6;padding:16px;text-align:center;border-radius:8px;margin:16px 0">
          <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#4338ca">${otp}</span>
        </div>
        <p>This code expires in <strong>10 minutes</strong>.</p>
        <p style="color:#6b7280;font-size:13px">If you did not request this, please ignore this email.</p>
      </div>`,
    });
    return true;
  } catch (error) {
    console.error("Failed to send OTP email:", error);
    return false;
  }
}

const googleClient = new OAuth2Client();

const microsoftJwksClient = jwksClient({
  jwksUri: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
  cache: true,
  rateLimit: true,
});

function normalizeIndianPhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^91/, "");
}

function getMicrosoftSigningKey(header: jwt.JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    microsoftJwksClient.getSigningKey(header.kid!, (err, key) => {
      if (err) return reject(err);
      resolve(key!.getPublicKey());
    });
  });
}

async function verifyGoogleToken(idToken: string): Promise<{ email: string; name: string } | null> {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return null;
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) return null;
    return { email: payload.email, name: payload.name || payload.email.split("@")[0] };
  } catch (error) {
    console.error("Google token verification failed:", error);
    return null;
  }
}

async function verifyMicrosoftToken(idToken: string): Promise<{ email: string; name: string } | null> {
  try {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) return null;

    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || !decoded.header) return null;

    const signingKey = await getMicrosoftSigningKey(decoded.header);
    const payload = jwt.verify(idToken, signingKey, {
      audience: clientId,
    }) as any;

    const issuer = payload.iss as string;
    if (!issuer || !issuer.startsWith("https://login.microsoftonline.com/")) {
      return null;
    }

    const email = payload.email || payload.preferred_username;
    if (!email) return null;
    return { email, name: payload.name || email.split("@")[0] };
  } catch (error) {
    console.error("Microsoft token verification failed:", error);
    return null;
  }
}

async function handleOAuthLogin(email: string, fullName: string, provider: string, res: Response) {
  const [existingUser] = await db.select().from(users).where(eq(users.email, email));

  if (existingUser) {
    if (existingUser.authProvider === "local" && existingUser.password && existingUser.password !== "") {
      return res.status(409).json({
        error: `An account with this email already exists. Please sign in with your email and password instead.`,
      });
    }

    if (existingUser.authProvider && existingUser.authProvider !== provider && existingUser.authProvider !== "local") {
      return res.status(409).json({
        error: `This account uses ${existingUser.authProvider} sign-in. Please use that method instead.`,
      });
    }

    if (!existingUser.authProvider || existingUser.authProvider === "local") {
      await db.update(users).set({ authProvider: provider }).where(eq(users.id, existingUser.id));
    }

    const token = signToken({ userId: existingUser.id, role: existingUser.role });
    return res.json({
      token,
      user: {
        id: existingUser.id,
        email: existingUser.email,
        fullName: existingUser.fullName,
        phone: existingUser.phone,
        role: existingUser.role,
        creditScore: existingUser.creditScore,
        riskTier: existingUser.riskTier,
        reputationScore: existingUser.reputationScore,
        walletBalance: existingUser.walletBalance,
        isKycVerified: existingUser.isKycVerified,
      },
    });
  }

  const [newUser] = await db.insert(users).values({
    email,
    password: "",
    fullName,
    authProvider: provider,
    role: "user",
  }).returning();

  await logAudit({
    userId: newUser.id,
    action: "user_registered",
    entity: "user",
    entityId: newUser.id,
    details: { provider },
  });

  const token = signToken({ userId: newUser.id, role: newUser.role });
  return res.status(201).json({
    token,
    user: {
      id: newUser.id,
      email: newUser.email,
      fullName: newUser.fullName,
      phone: newUser.phone,
      role: newUser.role,
      creditScore: newUser.creditScore,
      reputationScore: newUser.reputationScore,
      isKycVerified: newUser.isKycVerified,
    },
  });
}

router.get("/firebase-config", (_req: Request, res: Response) => {
  if (!isFirebaseConfigured()) {
    return res.status(503).json({ error: "Firebase Phone Auth is not configured", enabled: false });
  }

  res.json({ enabled: true, config: getFirebaseConfig() });
});

router.post("/send-otp", async (req: Request, res: Response) => {
  try {
    const { email, fullName, phone } = req.body;

    if (!email || !fullName) {
      return res.status(400).json({ error: "Email and full name are required" });
    }

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required for OTP verification" });
    }

    const cleanedPhone = normalizeIndianPhone(phone);
    if (!/^[6-9]\d{9}$/.test(cleanedPhone)) {
      return res.status(400).json({ error: "Please enter a valid 10-digit Indian mobile number" });
    }

    if (!isFirebaseConfigured()) {
      return res.status(503).json({ error: "Firebase Phone Auth is not configured on the server" });
    }

    const existing = await db.select().from(users).where(eq(users.email, email));
    if (existing.length > 0 && existing[0].emailVerified) {
      return res.status(409).json({ error: "User with this email already exists" });
    }

    const maskedPhone = `${cleanedPhone.slice(0, 2)}******${cleanedPhone.slice(-2)}`;
    res.json({
      message: `Firebase OTP will be sent to +91 ${maskedPhone}`,
      provider: "firebase",
      maskedPhone,
    });
  } catch (error) {
    console.error("Send OTP error:", error);
    res.status(500).json({ error: "Failed to initialize phone verification" });
  }
});

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, fullName, phone, firebaseIdToken } = req.body;

    if (!email || !password || !fullName || !phone) {
      return res.status(400).json({ error: "Email, password, full name, and phone are required" });
    }

    if (!firebaseIdToken) {
      return res.status(400).json({ error: "Firebase phone verification is required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const cleanedPhone = normalizeIndianPhone(phone);
    if (!/^[6-9]\d{9}$/.test(cleanedPhone)) {
      return res.status(400).json({ error: "Please enter a valid 10-digit Indian mobile number" });
    }

    const verifiedPhone = await verifyFirebaseIdToken(firebaseIdToken);
    if (normalizeIndianPhone(verifiedPhone.phone) != cleanedPhone) {
      return res.status(400).json({ error: "Verified phone number does not match the registration number" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [existingUser] = await db.select().from(users).where(eq(users.email, email));

    if (existingUser?.emailVerified) {
      return res.status(409).json({ error: "User with this email already exists" });
    }

    let user;
    if (existingUser) {
      [user] = await db.update(users)
        .set({
          password: hashedPassword,
          fullName,
          phone: cleanedPhone,
          emailVerified: true,
          emailOtp: null,
          emailOtpExpiry: null,
        })
        .where(eq(users.id, existingUser.id))
        .returning();
    } else {
      [user] = await db.insert(users).values({
        email,
        password: hashedPassword,
        fullName,
        phone: cleanedPhone,
        emailVerified: true,
        role: "user",
      }).returning();
      await logAudit({
        userId: user.id,
        action: "user_registered",
        entity: "user",
        entityId: user.id,
        details: { provider: "local" },
      });
    }

    const token = signToken({ userId: user.id, role: user.role });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        creditScore: user.creditScore,
        reputationScore: user.reputationScore,
        isKycVerified: user.isKycVerified,
      },
    });
  } catch (error: any) {
    console.error("Registration error:", error);
    res.status(500).json({ error: error.message || "Registration failed" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.emailVerified && user.authProvider === "local") {
      return res.status(401).json({ error: "Email not verified. Please register again to verify your email." });
    }

    if (user.authProvider && user.authProvider !== "local" && !user.password) {
      return res.status(401).json({ error: `This account uses ${user.authProvider} sign-in. Please use that method instead.` });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signToken({ userId: user.id, role: user.role });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        creditScore: user.creditScore,
        riskTier: user.riskTier,
        reputationScore: user.reputationScore,
        walletBalance: user.walletBalance,
        isKycVerified: user.isKycVerified,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/oauth/google", async (req: Request, res: Response) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Google credential is required" });

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: "Google sign-in is not configured" });
    }

    const userData = await verifyGoogleToken(credential);
    if (!userData) return res.status(401).json({ error: "Invalid Google token or email not verified" });

    await handleOAuthLogin(userData.email, userData.name, "google", res);
  } catch (error) {
    console.error("Google OAuth error:", error);
    res.status(500).json({ error: "Google sign-in failed" });
  }
});

router.post("/oauth/microsoft", async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: "Microsoft ID token is required" });

    if (!process.env.MICROSOFT_CLIENT_ID) {
      return res.status(500).json({ error: "Microsoft sign-in is not configured" });
    }

    const userData = await verifyMicrosoftToken(idToken);
    if (!userData) return res.status(401).json({ error: "Invalid Microsoft token or email not verified" });

    await handleOAuthLogin(userData.email, userData.name, "microsoft", res);
  } catch (error) {
    console.error("Microsoft OAuth error:", error);
    res.status(500).json({ error: "Microsoft sign-in failed" });
  }
});

router.get("/oauth/config", (_req: Request, res: Response) => {
  res.json({
    google: process.env.GOOGLE_CLIENT_ID ? { clientId: process.env.GOOGLE_CLIENT_ID } : null,
    microsoft: process.env.MICROSOFT_CLIENT_ID ? { clientId: process.env.MICROSOFT_CLIENT_ID } : null,
  });
});

router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const genericMessage = "If an account with that email exists, a password reset link has been sent.";

    const [user] = await db.select().from(users).where(eq(users.email, email));

    if (!user || (user.authProvider && user.authProvider !== "local")) {
      return res.json({ message: genericMessage });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 1);

    await db.update(users)
      .set({ resetToken: tokenHash, resetTokenExpiry: expiry })
      .where(eq(users.id, user.id));

    console.log(`[DEMO] Password reset link for ${email}: /reset-password?token=${resetToken}`);

    res.json({
      message: genericMessage,
      simulatedLink: `/reset-password?token=${resetToken}`,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Failed to process password reset request" });
  }
});

router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: "Token and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const [user] = await db.select().from(users).where(eq(users.resetToken, tokenHash));

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    if (user.resetTokenExpiry && new Date() > new Date(user.resetTokenExpiry)) {
      await db.update(users)
        .set({ resetToken: null, resetTokenExpiry: null })
        .where(eq(users.id, user.id));
      return res.status(400).json({ error: "Reset token has expired. Please request a new one." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.update(users)
      .set({
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      })
      .where(eq(users.id, user.id));

    res.json({ message: "Password has been reset successfully. You can now sign in with your new password." });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

router.get("/me", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "No token provided" });

    const [user] = await db.select().from(users).where(eq(users.id, auth.userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      creditScore: user.creditScore,
      riskTier: user.riskTier,
      reputationScore: user.reputationScore,
      walletBalance: user.walletBalance,
      isKycVerified: user.isKycVerified,
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

router.get("/trust-summary", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "No token provided" });

    const summary = await getBorrowerTrustSummary(auth.userId);
    res.json(summary);
  } catch (error) {
    console.error("Trust summary error:", error);
    res.status(500).json({ error: "Failed to load borrower trust summary" });
  }
});

router.get("/timeline", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "No token provided" });

    const timeline = await getUserTimeline(auth.userId);
    res.json(timeline);
  } catch (error) {
    console.error("Timeline error:", error);
    res.status(500).json({ error: "Failed to load activity timeline" });
  }
});

export const authenticateToken = requireAuth;
export { requireAdmin } from "../middleware/auth.js";

export default router;
