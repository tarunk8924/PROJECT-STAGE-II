import React, { useState, useEffect } from "react";
import { Globe, ExternalLink, CheckCircle, AlertCircle } from "lucide-react";

interface HealthData {
  status: string;
  blockchain: string;
  timestamp: string;
}

export default function NetworkConfig() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadHealthData();
  }, []);

  const loadHealthData = async () => {
    try {
      const response = await fetch("/api/health");
      if (!response.ok) throw new Error("Failed to fetch health data");
      const data = await response.json();
      setHealth(data);
    } catch (err: any) {
      setError(err.message || "Failed to load network configuration");
    } finally {
      setLoading(false);
    }
  };

  const networkOptions = [
    {
      id: "sepolia",
      name: "Sepolia Testnet",
      description:
        "Ethereum's official test network for development and testing",
      active: health?.blockchain === "ethereum_sepolia",
      pros: ["Real Ethereum network", "Official test network", "Active support"],
      cons: ["Requires testnet ETH", "Different from mainnet"],
      badge: "Active",
      etherscanBase: "https://sepolia.etherscan.io",
    },
    {
      id: "mainnet",
      name: "Ethereum Mainnet",
      description: "The main Ethereum network (production)",
      active: false,
      pros: [
        "Production network",
        "Maximum security",
        "All DeFi platforms",
      ],
      cons: ["Requires real ETH", "Higher gas fees", "Immutable transactions"],
      badge: "Coming Soon",
      etherscanBase: "https://etherscan.io",
    },
    {
      id: "polygon",
      name: "Polygon (Matic)",
      description: "Layer 2 solution for Ethereum with lower fees",
      active: false,
      pros: ["Much lower fees", "Fast transactions", "EVM compatible"],
      cons: ["Bridging required", "Newer network"],
      badge: "Coming Soon",
      etherscanBase: "https://polygonscan.com",
    },
  ];

  const currentNetwork = networkOptions.find(
    (n) => n.active || health?.blockchain === "ethereum_sepolia"
  );

  if (loading)
    return (
      <div className="text-center py-8 text-gray-400">
        Loading network configuration...
      </div>
    );
  if (error)
    return (
      <div className="max-w-4xl mx-auto">
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Globe className="w-7 h-7 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Network Config</h1>
          <p className="text-gray-500">View and configure blockchain network</p>
        </div>
      </div>

      {/* Current Network Status */}
      {currentNetwork && (
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-indigo-600 font-medium mb-2">
                Active Network
              </p>
              <h2 className="text-2xl font-bold text-indigo-900 mb-3">
                {currentNetwork.name}
              </h2>
              <div className="flex gap-4 text-sm">
                <div>
                  <p className="text-indigo-600 font-medium mb-1">Mode</p>
                  <p className="text-gray-700">
                    {health?.blockchain === "ethereum_sepolia"
                      ? "Ethereum Sepolia (Real)"
                      : "Simulation"}
                  </p>
                </div>
                <div>
                  <p className="text-indigo-600 font-medium mb-1">Status</p>
                  <div className="flex items-center gap-1 text-green-700">
                    <CheckCircle className="w-4 h-4" />
                    Connected
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 text-green-700 border border-green-300">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Active</span>
            </div>
          </div>
        </div>
      )}

      {/* Network Details Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-900">Network Details</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">
                CONNECTED NETWORK
              </p>
              <p className="text-lg font-semibold text-gray-900">
                {currentNetwork?.name || "Not connected"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">
                DEPLOYMENT MODE
              </p>
              <p className="text-lg font-semibold text-gray-900">
                {health?.blockchain === "ethereum_sepolia"
                  ? "Ethereum Sepolia (Real)"
                  : "Simulation"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">
                LAST UPDATED
              </p>
              <p className="text-lg font-semibold text-gray-900">
                {health?.timestamp
                  ? new Date(health.timestamp).toLocaleString()
                  : "Unknown"}
              </p>
            </div>
          </div>

          <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">
                NETWORK STATUS
              </p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <p className="text-lg font-semibold text-green-700">Connected</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">
                ACTIONS
              </p>
              <div className="space-y-2">
                {currentNetwork?.etherscanBase && (
                  <a
                    href={currentNetwork.etherscanBase}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    View on Etherscan
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Available Networks */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Available Networks
          </h3>
          <p className="text-sm text-gray-500">
            Configuration options for different blockchain environments
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {networkOptions.map((network) => (
            <div
              key={network.id}
              className={`rounded-xl border p-5 transition-all ${
                network.active
                  ? "border-indigo-300 bg-indigo-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <h4 className="font-semibold text-gray-900">
                  {network.name}
                </h4>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    network.active
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {network.badge}
                </span>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                {network.description}
              </p>

              <div className="space-y-3 mb-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    PROS
                  </p>
                  <ul className="text-xs text-gray-600 space-y-1">
                    {network.pros.map((pro, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5">✓</span>
                        <span>{pro}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    CONS
                  </p>
                  <ul className="text-xs text-gray-600 space-y-1">
                    {network.cons.map((con, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-red-600 mt-0.5">✕</span>
                        <span>{con}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {network.active ? (
                <button
                  disabled
                  className="w-full px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                >
                  Currently Active
                </button>
              ) : (
                <button
                  disabled
                  className="w-full px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium disabled:opacity-50 cursor-not-allowed"
                >
                  Coming Soon
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Network Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-blue-900 mb-1">
              About Network Configuration
            </h4>
            <p className="text-sm text-blue-700">
              The platform currently operates on Ethereum Sepolia for testing
              and development. Additional networks will be supported in future
              releases. Network changes require backend configuration and
              contract redeployment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
