import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut,
  type Auth,
  type ConfirmationResult,
} from "firebase/auth";

interface FirebasePublicConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

let appPromise: Promise<FirebaseApp> | null = null;
const verifierCache = new Map<string, RecaptchaVerifier>();

async function loadFirebaseConfig(): Promise<FirebasePublicConfig> {
  const response = await fetch("/api/auth/firebase-config");
  const data = await response.json();

  if (!response.ok || !data.enabled) {
    throw new Error(data.error || "Firebase Phone Auth is not configured");
  }

  return data.config as FirebasePublicConfig;
}

async function getFirebaseApp(): Promise<FirebaseApp> {
  if (!appPromise) {
    appPromise = loadFirebaseConfig().then((config) => {
      if (getApps().length > 0) return getApp();
      return initializeApp(config);
    });
  }

  return appPromise;
}

export async function getFirebaseAuthClient(): Promise<Auth> {
  const app = await getFirebaseApp();
  const auth = getAuth(app);
  auth.languageCode = "en";
  return auth;
}

function clearVerifier(containerId: string) {
  const existing = verifierCache.get(containerId);
  if (existing) {
    existing.clear();
    verifierCache.delete(containerId);
  }
}

export async function sendFirebasePhoneOtp(phoneNumber: string, containerId: string): Promise<ConfirmationResult> {
  const auth = await getFirebaseAuthClient();
  clearVerifier(containerId);

  const verifier = new RecaptchaVerifier(auth, containerId, {
    size: "normal",
  });

  verifierCache.set(containerId, verifier);

  try {
    const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
    console.log("[Firebase] OTP request accepted for", phoneNumber);
    return result;
  } catch (error) {
    console.error("[Firebase] Failed to send phone OTP:", error);
    throw error;
  }
}

export async function confirmFirebasePhoneOtp(
  confirmationResult: ConfirmationResult,
  code: string,
): Promise<{ idToken: string; phoneNumber: string }> {
  const auth = await getFirebaseAuthClient();
  const credential = await confirmationResult.confirm(code);
  const idToken = await credential.user.getIdToken(true);
  const phoneNumber = credential.user.phoneNumber || "";
  await signOut(auth);
  return { idToken, phoneNumber };
}

export function resetFirebaseRecaptcha(containerId: string) {
  clearVerifier(containerId);
}
