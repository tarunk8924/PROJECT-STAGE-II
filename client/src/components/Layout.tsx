import React, { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  LayoutDashboard, CreditCard, FileText, Wallet, Shield, BarChart3,
  Users, CheckCircle, LogOut, Menu, X, Blocks, Landmark, TrendingUp,
  Handshake, ShieldCheck, Globe, Camera
} from "lucide-react";

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAdmin = user?.role === "admin";

  const userLinks = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/credit-score", label: "Credit Score", icon: BarChart3 },
    { to: "/apply-loan", label: "Apply Loan", icon: FileText },
    { to: "/my-loans", label: "My Loans", icon: Wallet },
    { to: "/analytics", label: "Analytics", icon: TrendingUp },
    { to: "/earnings", label: "Earnings", icon: CreditCard },
    { to: "/p2p", label: "P2P Lending", icon: Handshake },
    { to: "/wallet", label: "Connect Wallet", icon: Landmark },
    { to: "/kyc", label: "KYC Verification", icon: Shield },
  ];

  const adminLinks = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { to: "/admin/loans", label: "Manage Loans", icon: FileText },
    { to: "/admin/users", label: "All Users", icon: Users },
    { to: "/admin/kyc", label: "KYC Reviews", icon: ShieldCheck },
    { to: "/admin/earnings-evidence", label: "Earnings Reviews", icon: Camera },
    { to: "/admin/insurance-pool", label: "Insurance Pool", icon: ShieldCheck },
    { to: "/admin/network-config", label: "Network Config", icon: Globe },
  ];

  const links = isAdmin ? adminLinks : userLinks;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-gradient-to-b from-indigo-900 to-indigo-800 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-auto ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-2 p-5 border-b border-indigo-700">
          <Blocks className="w-7 h-7 text-indigo-300" />
          <div>
            <h1 className="text-lg font-bold text-white">MicroCredit</h1>
            <p className="text-xs text-indigo-300">Blockchain Lending</p>
          </div>
        </div>

        <nav className="mt-4 px-3 space-y-1">
          {links.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-indigo-700 text-white"
                    : "text-indigo-200 hover:bg-indigo-700/50 hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-indigo-700">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold">
              {user?.fullName?.charAt(0) || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.fullName}</p>
              <p className="text-xs text-indigo-300 truncate">{user?.email}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-indigo-200 hover:text-white hover:bg-indigo-700/50 rounded-lg transition-colors">
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 lg:px-6">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-500 hover:text-gray-700">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">Admin</span>
            )}
            {user?.isKycVerified && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                <CheckCircle className="w-3 h-3" /> KYC Verified
              </span>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
