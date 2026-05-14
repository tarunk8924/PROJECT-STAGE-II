import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { FileText, Blocks, ArrowLeft, CreditCard, ExternalLink, IndianRupee, RefreshCw, CheckCircle, XCircle, Clock, X, Info, Key, Globe, Shield } from "lucide-react";

const ETHERSCAN_BASE = "https://sepolia.etherscan.io";

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface RazorpayPayment {
  id: number;
  loanId?: number | null;
  orderId: string;
  paymentId: string | null;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  description: string | null;
  createdAt: string;
  paidAt: string | null;
}

export default function LoanDetails() {
  const { loanId } = useParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [repayAmount, setRepayAmount] = useState("");
  const [repaying, setRepaying] = useState(false);
  const [repayResult, setRepayResult] = useState<any>(null);
  const [error, setError] = useState("");

  const [razorpayConfigured, setRazorpayConfigured] = useState(false);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  const [razorpayProcessing, setRazorpayProcessing] = useState(false);
  const [razorpaySuccess, setRazorpaySuccess] = useState("");
  const [razorpayPayments, setRazorpayPayments] = useState<RazorpayPayment[]>([]);
  const [showRazorpayGuide, setShowRazorpayGuide] = useState(false);

  useEffect(() => {
    loadLoan();
    fetchRazorpayConfig();
    fetchRazorpayPayments();
  }, [loanId]);

  useEffect(() => {
    if (razorpayConfigured && !razorpayLoaded) {
      const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
      if (existing) {
        setRazorpayLoaded(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => setRazorpayLoaded(true);
      document.body.appendChild(script);
    }
  }, [razorpayConfigured]);

  const loadLoan = async () => {
    try {
      const result = await api.loans.get(parseInt(loanId!));
      setData(result);
    } catch (err: any) {
      setError(err.message || "Failed to load loan details");
    } finally {
      setLoading(false);
    }
  };

  const fetchRazorpayConfig = async () => {
    try {
      const config = await api.razorpay.config();
      setRazorpayConfigured(config.configured);
    } catch {}
  };

  const fetchRazorpayPayments = async () => {
    try {
      const payments = await api.razorpay.payments();
      setRazorpayPayments(payments.filter((p: RazorpayPayment) => p.loanId === parseInt(loanId!)));
    } catch {}
  };

  const handleRepay = async (e: React.FormEvent) => {
    e.preventDefault();
    setRepaying(true);
    setError("");
    setRepayResult(null);
    try {
      const result = await api.repay.make(parseInt(loanId!), parseFloat(repayAmount));
      setRepayResult(result);
      setRepayAmount("");
      await loadLoan();
      await refreshUser();
    } catch (err: any) {
      setError(err.message || "Repayment failed");
    } finally {
      setRepaying(false);
    }
  };

  const handleRazorpayPayment = async (amount: number) => {
    if (!amount || amount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setRazorpayProcessing(true);
    setError("");
    setRazorpaySuccess("");

    try {
      const orderData = await api.razorpay.createOrder({
        amount,
        description: `Loan #${loanId} Repayment`,
        loanId: parseInt(loanId!),
      });

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "MicroCredit Platform",
        description: `Loan #${loanId} Repayment - ₹${amount.toLocaleString()}`,
        order_id: orderData.orderId,
        handler: async (response: any) => {
          try {
            await api.razorpay.verify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setRazorpaySuccess(`Payment of ₹${amount.toLocaleString()} successful via Razorpay!`);
            fetchRazorpayPayments();
            await loadLoan();
            await refreshUser();
          } catch (err: any) {
            setError(err.message || "Payment verification failed");
          }
        },
        modal: {
          ondismiss: () => {
            setRazorpayProcessing(false);
          },
        },
        theme: {
          color: "#4F46E5",
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", async (response: any) => {
        try {
          await api.razorpay.failed({
            orderId: orderData.orderId,
            errorCode: response.error?.code,
            errorDescription: response.error?.description,
          });
        } catch {}
        setError(`Payment failed: ${response.error?.description || "Unknown error"}`);
        fetchRazorpayPayments();
      });
      rzp.open();
    } catch (err: any) {
      setError(err.message || "Failed to initiate Razorpay payment");
    } finally {
      setRazorpayProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full inline-flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Paid</span>;
      case "failed":
        return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full inline-flex items-center gap-1"><XCircle className="w-3 h-3" /> Failed</span>;
      case "created":
        return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>;
      default:
        return <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">{status}</span>;
    }
  };

  const isOnChainEvent = (event: any) => event?.onChain === true;

  const getTxUrl = (txHash: string) => `${ETHERSCAN_BASE}/tx/${txHash}`;
  const getAddressUrl = (address: string) => `${ETHERSCAN_BASE}/address/${address}`;

  if (loading) return <div className="text-center py-8 text-gray-400">Loading...</div>;
  if (error && !data) return <div className="max-w-4xl mx-auto"><div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div></div>;
  if (!data) return <div className="text-center py-8 text-red-500">Loan not found</div>;

  const { loan, contract, repayments, blockchainMode } = data;
  const remaining = loan.totalDue - (loan.amountRepaid || 0);
  const progress = loan.totalDue > 0 ? ((loan.amountRepaid || 0) / loan.totalDue) * 100 : 0;
  const isEthereum = blockchainMode === "ethereum_sepolia";
  const events = contract?.events ? JSON.parse(contract.events) : [];
  const hasOnChainEvents = events.some((e: any) => e.onChain);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button onClick={() => navigate("/my-loans")} className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to My Loans
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-6 h-6 text-indigo-600" />
            <h2 className="text-xl font-bold text-gray-900">Loan #{loan.id}</h2>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              loan.status === "active" ? "bg-blue-100 text-blue-700" :
              loan.status === "completed" ? "bg-green-100 text-green-700" :
              loan.status === "pending" ? "bg-yellow-100 text-yellow-700" :
              "bg-red-100 text-red-700"
            }`}>{loan.status}</span>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Amount</span><span className="font-medium">₹{loan.amount.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Interest Rate</span><span className="font-medium">{loan.interestRate}% p.a.</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Tenure</span><span className="font-medium">{loan.tenure} months</span></div>
            {loan.monthlyEmi ? (
              <div className="flex justify-between"><span className="text-gray-500">Monthly EMI</span><span className="font-medium">₹{loan.monthlyEmi?.toFixed(2)}</span></div>
            ) : (
              <div className="flex justify-between"><span className="text-gray-500">Repayment</span><span className="font-medium text-green-600">Lump sum (no EMI)</span></div>
            )}
            <hr />
            <div className="flex justify-between"><span className="text-gray-500">Total Due</span><span className="font-bold">₹{loan.totalDue.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Repaid</span><span className="font-bold text-green-600">₹{(loan.amountRepaid || 0).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Remaining</span><span className="font-bold text-red-600">₹{remaining.toFixed(2)}</span></div>
          </div>

          {loan.status === "active" && (
            <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${Math.min(100, progress)}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-1">{progress.toFixed(1)}% repaid</p>
            </div>
          )}
        </div>

        {contract && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Blocks className="w-6 h-6 text-purple-600" />
              <h2 className="text-lg font-bold text-gray-900">Smart Contract</h2>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                hasOnChainEvents ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
              }`}>
                {hasOnChainEvents ? "Ethereum Sepolia" : "Simulated"}
              </span>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500 block">Contract Address</span>
                {hasOnChainEvents ? (
                  <a href={getAddressUrl(contract.contractAddress)} target="_blank" rel="noopener noreferrer"
                    className="font-mono text-xs break-all text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1">
                    {contract.contractAddress}
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                ) : (
                  <span className="font-mono text-xs break-all">{contract.contractAddress}</span>
                )}
              </div>
              <div><span className="text-gray-500 block">Contract Hash</span><span className="font-mono text-xs break-all">{contract.contractHash}</span></div>
              <div><span className="text-gray-500 block">Block Number</span><span className="font-medium">{contract.blockNumber}</span></div>
              <div><span className="text-gray-500 block">Status</span><span className="font-medium capitalize">{contract.status}</span></div>
            </div>

            {events.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Event Log</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {events.map((evt: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className={`inline-block w-2 h-2 mt-1 rounded-full flex-shrink-0 ${evt.onChain ? "bg-green-500" : "bg-gray-300"}`} />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{evt.event}</span>
                        <span className="text-gray-400 ml-2">{new Date(evt.timestamp).toLocaleString()}</span>
                        {evt.onChain && evt.txHash && (
                          <a href={getTxUrl(evt.txHash)} target="_blank" rel="noopener noreferrer"
                            className="ml-2 text-indigo-500 hover:text-indigo-700 inline-flex items-center gap-0.5">
                            View on Etherscan <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {loan.blockchainTxId && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm">
            <Blocks className="w-4 h-4 text-purple-600" />
            <span className="text-purple-700 font-medium">Blockchain Transaction:</span>
            {hasOnChainEvents ? (
              <a href={getTxUrl(loan.blockchainTxId)} target="_blank" rel="noopener noreferrer"
                className="font-mono text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1">
                {loan.blockchainTxId.slice(0, 20)}...{loan.blockchainTxId.slice(-8)}
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="font-mono text-xs text-purple-600">{loan.blockchainTxId.slice(0, 20)}...{loan.blockchainTxId.slice(-8)}</span>
            )}
          </div>
        </div>
      )}

      {loan.status === "active" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-600" /> Make Repayment
          </h3>
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
          {repayResult && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
              <p>Payment of ₹{repayResult.repayment.amount.toLocaleString()} successful!</p>
              <p className="mt-1 font-mono text-xs">
                Tx: {repayResult.blockchain.txHash.slice(0, 16)}...
                {repayResult.blockchain.onChain && repayResult.blockchain.etherscanTxUrl && (
                  <a href={repayResult.blockchain.etherscanTxUrl} target="_blank" rel="noopener noreferrer"
                    className="ml-2 text-green-700 underline inline-flex items-center gap-0.5">
                    View on Etherscan <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </p>
              {repayResult.reputation && <span className="block mt-1">Reputation: {repayResult.reputation.change > 0 ? "+" : ""}{repayResult.reputation.change} (now {repayResult.reputation.newScore})</span>}
            </div>
          )}
          {razorpaySuccess && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {razorpaySuccess}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Repayment Amount</label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  value={repayAmount}
                  onChange={e => setRepayAmount(e.target.value)}
                  min="1"
                  max={remaining}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder={`Amount (max ₹${remaining.toFixed(2)})`}
                />
              </div>
              <div className="flex gap-2 mt-2">
                {loan.monthlyEmi && (
                  <button type="button" onClick={() => setRepayAmount(loan.monthlyEmi?.toFixed(2) || "")}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-xs font-medium transition-colors">
                    1 EMI (₹{loan.monthlyEmi?.toFixed(0)})
                  </button>
                )}
                <button type="button" onClick={() => setRepayAmount(remaining.toFixed(2))}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-xs font-medium transition-colors">
                  Full (₹{remaining.toFixed(0)})
                </button>
              </div>
            </div>

            <div className="grid gap-3">
              <div>
                {razorpayConfigured ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleRazorpayPayment(parseFloat(repayAmount))}
                      disabled={razorpayProcessing || !razorpayLoaded || !repayAmount || parseFloat(repayAmount) <= 0}
                      className="w-full flex items-center justify-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors text-sm font-medium"
                    >
                      {razorpayProcessing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Processing...
                        </>
                      ) : (
                        <>
                          <IndianRupee className="w-4 h-4" /> Pay via Razorpay
                        </>
                      )}
                    </button>
                    <p className="text-xs text-gray-400 mt-1 text-center">Cards, UPI, Net Banking, Wallets</p>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowRazorpayGuide(true)}
                      className="w-full flex items-center justify-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      <IndianRupee className="w-4 h-4" /> Pay via Razorpay
                    </button>
                    <p className="text-xs text-amber-500 mt-1 text-center flex items-center justify-center gap-1">
                      <Info className="w-3 h-3" /> Setup required — click to see steps
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {razorpayPayments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Razorpay Payments</h3>
            <button
              onClick={fetchRazorpayPayments}
              className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-gray-500 font-medium">Date</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Amount</th>
                  <th className="text-left py-2 text-gray-500 font-medium">Method</th>
                  <th className="text-left py-2 text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {razorpayPayments.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 text-gray-600">
                      {new Date(p.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="py-2 text-right font-medium text-gray-900">
                      ₹{p.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 text-gray-600 capitalize">{p.method || "-"}</td>
                    <td className="py-2">{getStatusBadge(p.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {repayments && repayments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Repayment History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200">
                <th className="text-left py-2 text-gray-500 font-medium">Date</th>
                <th className="text-left py-2 text-gray-500 font-medium">Amount</th>
                <th className="text-left py-2 text-gray-500 font-medium">On Time</th>
                <th className="text-left py-2 text-gray-500 font-medium">Tx Hash</th>
              </tr></thead>
              <tbody>
                {repayments.map((r: any) => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-2">{new Date(r.paidAt).toLocaleDateString()}</td>
                    <td className="py-2 font-medium">₹{r.amount.toLocaleString()}</td>
                    <td className="py-2">{r.isOnTime ? <span className="text-green-600">Yes</span> : <span className="text-red-600">No</span>}</td>
                    <td className="py-2 font-mono text-xs text-gray-500">
                      {hasOnChainEvents && r.transactionHash ? (
                        <a href={getTxUrl(r.transactionHash)} target="_blank" rel="noopener noreferrer"
                          className="text-indigo-500 hover:text-indigo-700 inline-flex items-center gap-0.5">
                          {r.transactionHash?.slice(0, 16)}... <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span>{r.transactionHash?.slice(0, 16)}...</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {showRazorpayGuide && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-5 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <IndianRupee className="w-5 h-5 text-green-700" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Razorpay Setup Guide</h3>
                  <p className="text-xs text-gray-500">Get your API keys to enable payments</p>
                </div>
              </div>
              <button onClick={() => setShowRazorpayGuide(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">What is Razorpay?</p>
                    <p className="text-blue-700">Razorpay is India's leading payment gateway. It lets you accept payments via UPI, Credit/Debit Cards, Net Banking, and Wallets. You need an account to enable this feature.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Key className="w-4 h-4 text-indigo-600" />
                  Steps to Get API Keys
                </h4>

                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0">1</div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">Create a Razorpay Account</p>
                      <p className="text-xs text-gray-500 mt-0.5">Go to <a href="https://dashboard.razorpay.com/signup" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-700 underline">dashboard.razorpay.com/signup</a> and sign up with your email. Complete the basic business verification.</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0">2</div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">Switch to Test Mode</p>
                      <p className="text-xs text-gray-500 mt-0.5">In the Razorpay Dashboard, toggle to <strong>Test Mode</strong> using the switch at the top-left. This lets you test without real money.</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0">3</div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">Generate API Keys</p>
                      <p className="text-xs text-gray-500 mt-0.5">Navigate to <strong>Settings</strong> {">"} <strong>API Keys</strong> {">"} click <strong>"Generate Key"</strong>. You'll get two values:</p>
                      <div className="mt-2 space-y-1.5">
                        <div className="bg-gray-50 rounded-lg p-2.5 flex items-center gap-2">
                          <Key className="w-3.5 h-3.5 text-green-600 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-gray-800">Key ID</p>
                            <p className="text-xs text-gray-500">Starts with <code className="bg-gray-200 px-1 rounded">rzp_test_</code></p>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5 flex items-center gap-2">
                          <Shield className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-gray-800">Key Secret</p>
                            <p className="text-xs text-gray-500">Shown only once — save it immediately!</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0">4</div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">Add Keys to Environment</p>
                      <p className="text-xs text-gray-500 mt-0.5">Add these as environment secrets in your project:</p>
                      <div className="mt-2 bg-gray-900 rounded-lg p-3 text-xs font-mono">
                        <p className="text-green-400">RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxx</p>
                        <p className="text-green-400">RAZORPAY_KEY_SECRET=your_secret_here</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0">5</div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">Restart & Pay</p>
                      <p className="text-xs text-gray-500 mt-0.5">Restart the application. The "Pay via Razorpay" button will now open the Razorpay checkout with UPI, cards, net banking, and wallet options.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Globe className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800 mb-1">Test Mode Details</p>
                    <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
                      <li>Use card number <code className="bg-amber-100 px-1 rounded">4111 1111 1111 1111</code> with any future expiry and CVV</li>
                      <li>UPI: Use <code className="bg-amber-100 px-1 rounded">success@razorpay</code> for successful test payments</li>
                      <li>No real money is charged in test mode</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <a
                  href="https://dashboard.razorpay.com/signup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Razorpay Dashboard
                </a>
                <button
                  onClick={() => setShowRazorpayGuide(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
