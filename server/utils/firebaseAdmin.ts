import admin from "firebase-admin";

let firebaseApp: admin.app.App | null = null;

function initFirebaseAdmin(): admin.app.App | null {
  if (firebaseApp) return firebaseApp;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    console.log("[Firebase] FIREBASE_SERVICE_ACCOUNT not configured, Firebase Phone Auth disabled");
    return null;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("[Firebase] Admin SDK initialized for project:", serviceAccount.project_id);
    return firebaseApp;
  } catch (error: any) {
    console.error("[Firebase] Failed to initialize Admin SDK:", error.message);
    return null;
  }
}

export function isFirebaseConfigured(): boolean {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT && !!process.env.FIREBASE_API_KEY;
}

export function getFirebaseConfig() {
  return {
    apiKey: process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.FIREBASE_APP_ID || "",
  };
}

export async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; phone: string }> {
  const app = initFirebaseAdmin();
  if (!app) {
    throw new Error("Firebase Admin SDK not initialized");
  }

  const decodedToken = await admin.auth().verifyIdToken(idToken);
  if (!decodedToken.phone_number) {
    throw new Error("No phone number associated with this Firebase token");
  }

  return {
    uid: decodedToken.uid,
    phone: decodedToken.phone_number,
  };
}

initFirebaseAdmin();
