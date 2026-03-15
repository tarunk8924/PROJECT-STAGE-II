import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (element: HTMLElement, config: any) => void;
        };
      };
    };
    msal?: any;
  }
}

interface OAuthConfig {
  google: { clientId: string } | null;
  microsoft: { clientId: string } | null;
}

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) { resolve(); return; }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export default function OAuthButtons() {
  const { loginWithGoogle, loginWithMicrosoft } = useAuth();
  const [config, setConfig] = useState<OAuthConfig | null>(null);
  const [error, setError] = useState("");
  const [loadingMs, setLoadingMs] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const googleInitialized = useRef(false);

  useEffect(() => {
    api.auth.oauthConfig().then(setConfig).catch(() => {});
  }, []);

  const handleGoogleCallback = useCallback(async (response: any) => {
    try {
      setError("");
      await loginWithGoogle(response.credential);
    } catch (err: any) {
      setError(err.message || "Google sign-in failed");
    }
  }, [loginWithGoogle]);

  useEffect(() => {
    if (!config?.google || googleInitialized.current) return;

    loadScript("https://accounts.google.com/gsi/client", "google-gsi").then(() => {
      if (window.google && googleBtnRef.current) {
        googleInitialized.current = true;
        window.google.accounts.id.initialize({
          client_id: config.google!.clientId,
          callback: handleGoogleCallback,
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          width: 400,
          text: "signin_with",
          shape: "rectangular",
          logo_alignment: "left",
        });
      }
    });
  }, [config?.google, handleGoogleCallback]);

  const handleMicrosoftLogin = async () => {
    if (!config?.microsoft) return;
    setLoadingMs(true);
    setError("");

    try {
      await loadScript("https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js", "msal-js");

      const msalApp = new window.msal.PublicClientApplication({
        auth: {
          clientId: config.microsoft.clientId,
          authority: "https://login.microsoftonline.com/common",
          redirectUri: window.location.origin,
        },
        cache: { cacheLocation: "sessionStorage" },
      });

      await msalApp.initialize();
      const result = await msalApp.loginPopup({
        scopes: ["openid", "profile", "email", "User.Read"],
      });

      if (result?.idToken) {
        await loginWithMicrosoft(result.idToken);
      } else {
        throw new Error("No ID token received from Microsoft");
      }
    } catch (err: any) {
      if (err.errorCode !== "user_cancelled") {
        setError(err.message || "Microsoft sign-in failed");
      }
    } finally {
      setLoadingMs(false);
    }
  };

  if (!config || (!config.google && !config.microsoft)) return null;

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-gray-500">Or continue with</span>
        </div>
      </div>

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs">{error}</div>
      )}

      <div className="space-y-2">
        {config.google && (
          <div ref={googleBtnRef} className="flex justify-center [&>div]:!w-full" />
        )}

        {config.microsoft && (
          <button
            onClick={handleMicrosoftLogin}
            disabled={loadingMs}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm font-medium text-gray-700"
          >
            <svg className="w-5 h-5" viewBox="0 0 21 21">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            {loadingMs ? "Signing in..." : "Sign in with Microsoft"}
          </button>
        )}
      </div>
    </div>
  );
}
