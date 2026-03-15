import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api } from "./api";

interface User {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  creditScore: number;
  riskTier: string;
  reputationScore: number;
  walletBalance: number;
  isKycVerified: boolean;
  createdAt?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, phone?: string, firebaseIdToken?: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  loginWithMicrosoft: (idToken: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setUser(null);
        return;
      }
      const userData = await api.auth.me();
      setUser(userData);
    } catch {
      localStorage.removeItem("token");
      setUser(null);
    }
  };

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const result = await api.auth.login({ email, password });
    localStorage.setItem("token", result.token);
    setUser(result.user);
  };

  const register = async (email: string, password: string, fullName: string, phone?: string, firebaseIdToken?: string) => {
    const result = await api.auth.register({ email, password, fullName, phone, firebaseIdToken: firebaseIdToken || "" });
    localStorage.setItem("token", result.token);
    setUser(result.user);
  };

  const loginWithGoogle = async (credential: string) => {
    const result = await api.auth.oauthGoogle(credential);
    localStorage.setItem("token", result.token);
    setUser(result.user);
  };

  const loginWithMicrosoft = async (idToken: string) => {
    const result = await api.auth.oauthMicrosoft(idToken);
    localStorage.setItem("token", result.token);
    setUser(result.user);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginWithGoogle, loginWithMicrosoft, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}