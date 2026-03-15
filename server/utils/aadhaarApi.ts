import crypto from "crypto";
import { isFirebaseConfigured } from "./firebaseAdmin.js";

const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;

export function isSmsConfigured(): boolean {
  return isFirebaseConfigured() || !!MSG91_AUTH_KEY;
}

export function getVerificationMode(): "live" | "demo" {
  return isSmsConfigured() ? "live" : "demo";
}

export function getOtpProvider(): "firebase" | "msg91" | "demo" {
  if (isFirebaseConfigured()) return "firebase";
  if (MSG91_AUTH_KEY) return "msg91";
  return "demo";
}

export function getOtpProviderLabel(): string {
  const provider = getOtpProvider();
  if (provider === "firebase") return "Firebase Phone Auth";
  if (provider === "msg91") return "MSG91 SMS OTP";
  return "Demo (OTP shown on screen)";
}

export function validateAadhaarFormat(cleaned: string): { valid: boolean; error?: string } {
  if (!/^\d{12}$/.test(cleaned)) {
    return { valid: false, error: "Aadhaar number must be exactly 12 digits" };
  }
  if (/^[01]/.test(cleaned)) {
    return { valid: false, error: "Aadhaar number cannot start with 0 or 1" };
  }
  return { valid: true };
}

export function simulateUidaiResponse(aadhaar: string, userName?: string) {
  const lastFour = aadhaar.slice(-4);
  const hash = parseInt(lastFour) % 4;
  const addresses = [
    "123, MG Road, Bengaluru, Karnataka 560001",
    "45, Park Street, Kolkata, West Bengal 700016",
    "78, Connaught Place, New Delhi 110001",
    "92, Anna Salai, Chennai, Tamil Nadu 600002",
  ];

  return {
    name: userName || "Aadhaar Holder",
    dateOfBirth: `19${85 + (hash % 10)}-${String((hash % 12) + 1).padStart(2, "0")}-${String((hash % 28) + 1).padStart(2, "0")}`,
    gender: hash % 2 === 0 ? "Male" : "Female",
    address: addresses[hash % addresses.length],
    maskedAadhaar: `XXXX-XXXX-${lastFour}`,
    photo: null,
    verified: true,
    source: "UIDAI (Aadhaar + Mobile OTP Verified)",
    zip: "",
  };
}
