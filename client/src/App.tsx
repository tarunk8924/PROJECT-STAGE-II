import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import CreditScore from "./pages/CreditScore";
import ApplyLoan from "./pages/ApplyLoan";
import MyLoans from "./pages/MyLoans";
import LoanDetails from "./pages/LoanDetails";
import KYCVerification from "./pages/KYCVerification";
import Earnings from "./pages/Earnings";
import ConnectWallet from "./pages/ConnectWallet";
import AdminDashboard from "./pages/AdminDashboard";
import AdminLoans from "./pages/AdminLoans";
import AdminUsers from "./pages/AdminUsers";
import AdminKycReviews from "./pages/AdminKycReviews";
import AdminEarningsReviews from "./pages/AdminEarningsReviews";
import InsurancePool from "./pages/InsurancePool";
import NetworkConfig from "./pages/NetworkConfig";
import LoanCalculator from "./pages/LoanCalculator";
import BorrowerAnalytics from "./pages/BorrowerAnalytics";
import P2PLending from "./pages/P2PLending";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="text-lg text-gray-500">Loading...</div></div>;
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/dashboard" />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-50"><div className="text-lg text-gray-500">Loading...</div></div>;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === "admin" ? "/admin" : "/dashboard"} /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" /> : <Register />} />
      <Route path="/loan-calculator" element={<LoanCalculator />} />
      <Route path="/forgot-password" element={user ? <Navigate to="/dashboard" /> : <ForgotPassword />} />
      <Route path="/reset-password" element={user ? <Navigate to="/dashboard" /> : <ResetPassword />} />
      <Route path="/" element={<Navigate to={user ? (user.role === "admin" ? "/admin" : "/dashboard") : "/login"} />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/credit-score" element={<CreditScore />} />
        <Route path="/apply-loan" element={<ApplyLoan />} />
        <Route path="/my-loans" element={<MyLoans />} />
        <Route path="/loans/:loanId" element={<LoanDetails />} />
        <Route path="/kyc" element={<KYCVerification />} />
        <Route path="/earnings" element={<Earnings />} />
        <Route path="/wallet" element={<ConnectWallet />} />
        <Route path="/analytics" element={<BorrowerAnalytics />} />
        <Route path="/p2p" element={<P2PLending />} />
      </Route>
      <Route element={<ProtectedRoute adminOnly><Layout /></ProtectedRoute>}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/loans" element={<AdminLoans />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/kyc" element={<AdminKycReviews />} />
        <Route path="/admin/earnings-evidence" element={<AdminEarningsReviews />} />
        <Route path="/admin/insurance-pool" element={<InsurancePool />} />
        <Route path="/admin/network-config" element={<NetworkConfig />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
