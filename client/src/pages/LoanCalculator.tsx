import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Calculator, Blocks } from "lucide-react";

export default function LoanCalculator() {
  const [loanAmount, setLoanAmount] = useState(100000);
  const [tenure, setTenure] = useState(12);
  const [creditScore, setCreditScore] = useState(500);

  // Calculate interest rate based on credit score
  const interestRate = useMemo(() => {
    if (creditScore >= 750) return 8;
    if (creditScore >= 600) return 12;
    return 18;
  }, [creditScore]);

  // Calculate loan details
  const calculatedLoan = useMemo(() => {
    const simpleInterest = loanAmount >= 15000 ? (loanAmount * interestRate * tenure) / (100 * 12) : 0;
    const totalDue = loanAmount + simpleInterest;
    const monthlyEmi = loanAmount >= 15000 && tenure > 0 ? totalDue / tenure : 0;

    return {
      interestRate,
      totalInterest: simpleInterest,
      totalDue,
      monthlyEmi,
    };
  }, [loanAmount, tenure, interestRate]);

  // Generate EMI schedule
  const emiSchedule = useMemo(() => {
    const monthlyRate = (calculatedLoan.interestRate / 100) / 12;
    const schedule = [];
    let remainingBalance = loanAmount;

    for (let month = 1; month <= tenure; month++) {
      const interestPortion = remainingBalance * monthlyRate;
      const principalPortion = calculatedLoan.monthlyEmi - interestPortion;
      remainingBalance = Math.max(0, remainingBalance - principalPortion);

      schedule.push({
        month,
        emi: calculatedLoan.monthlyEmi,
        principal: principalPortion,
        interest: interestPortion,
        balance: remainingBalance,
      });
    }

    return schedule;
  }, [loanAmount, tenure, calculatedLoan]);

  // Get credit score tier
  const creditTier = useMemo(() => {
    if (creditScore >= 750) return { label: "Excellent", color: "bg-green-100 text-green-800" };
    if (creditScore >= 600) return { label: "Good", color: "bg-blue-100 text-blue-800" };
    return { label: "Fair", color: "bg-orange-100 text-orange-800" };
  }, [creditScore]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900">
      {/* Header with Branding */}
      <div className="pt-8 pb-12 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Blocks className="w-10 h-10 text-indigo-300" />
          <h1 className="text-3xl font-bold text-white">MicroCredit</h1>
        </div>
        <p className="text-indigo-300">Loan Calculator</p>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Calculator Form - Left Column */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <div className="flex items-center gap-2 mb-6">
                <Calculator className="w-5 h-5 text-indigo-600" />
                <h2 className="text-xl font-bold text-gray-900">Calculator</h2>
              </div>

              <div className="space-y-6">
                {/* Loan Amount */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Loan Amount: ₹{loanAmount.toLocaleString()}
                  </label>
                  <input
                    type="range"
                    min="1000"
                    max="500000"
                    step="1000"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <input
                    type="number"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(parseInt(e.target.value) || 1000)}
                    min="1000"
                    max="500000"
                    className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                    placeholder="Enter amount"
                  />
                  <p className="text-xs text-gray-500 mt-1">₹1,000 - ₹5,00,000</p>
                </div>

                {/* Tenure */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Tenure: {tenure} months
                  </label>
                  <select
                    value={tenure}
                    onChange={(e) => setTenure(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                  >
                    {[3, 6, 9, 12, 18, 24].map((m) => (
                      <option key={m} value={m}>
                        {m} months
                      </option>
                    ))}
                  </select>
                </div>

                {/* Credit Score */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Credit Score: {creditScore}
                  </label>
                  <input
                    type="range"
                    min="300"
                    max="900"
                    step="10"
                    value={creditScore}
                    onChange={(e) => setCreditScore(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <input
                    type="number"
                    value={creditScore}
                    onChange={(e) => setCreditScore(Math.min(900, Math.max(300, parseInt(e.target.value) || 300)))}
                    min="300"
                    max="900"
                    className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                    placeholder="Enter score"
                  />
                  <p className="text-xs text-gray-500 mt-1">300 - 900</p>
                </div>

                {/* Credit Tier */}
                <div className={`p-3 rounded-lg ${creditTier.color}`}>
                  <p className="text-sm font-medium">Credit Tier: {creditTier.label}</p>
                </div>

                {/* Interest Rate Info */}
                <div className="p-3 bg-indigo-50 rounded-lg">
                  <p className="text-xs text-indigo-700">
                    <strong>Interest Rate:</strong> {calculatedLoan.interestRate}% p.a.
                  </p>
                </div>

                {/* Apply Button */}
                <Link
                  to="/apply-loan"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Calculator className="w-4 h-4" />
                  Apply for Loan
                </Link>
              </div>
            </div>
          </div>

          {/* Results & Schedule - Right Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Key Metrics */}
            <div className={`grid grid-cols-1 ${loanAmount >= 15000 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
              {loanAmount >= 15000 && (
                <div className="bg-white rounded-2xl shadow-xl p-6 text-center">
                  <p className="text-sm text-gray-600 mb-2">Monthly EMI</p>
                  <p className="text-3xl font-bold text-indigo-600">₹{calculatedLoan.monthlyEmi.toFixed(0).toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-2">Per Month</p>
                </div>
              )}

              {/* Total Interest */}
              <div className="bg-white rounded-2xl shadow-xl p-6 text-center">
                <p className="text-sm text-gray-600 mb-2">Total Interest</p>
                <p className="text-3xl font-bold text-orange-600">₹{calculatedLoan.totalInterest.toFixed(0).toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-2">Over {tenure} months</p>
              </div>

              {/* Total Amount */}
              <div className="bg-white rounded-2xl shadow-xl p-6 text-center">
                <p className="text-sm text-gray-600 mb-2">Total Amount Due</p>
                <p className="text-3xl font-bold text-green-600">₹{calculatedLoan.totalDue.toFixed(0).toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-2">{loanAmount < 15000 ? 'Lump sum repayment' : 'Principal + Interest'}</p>
              </div>
            </div>

            {/* Principal vs Interest Bar Chart */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Loan Breakdown</h3>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex h-8 rounded-lg overflow-hidden border border-gray-200">
                    <div
                      className="bg-indigo-600 flex items-center justify-center text-white text-xs font-bold"
                      style={{ width: `${(loanAmount / calculatedLoan.totalDue) * 100}%` }}
                    >
                      {((loanAmount / calculatedLoan.totalDue) * 100).toFixed(0)}%
                    </div>
                    <div
                      className="bg-orange-400 flex items-center justify-center text-white text-xs font-bold"
                      style={{ width: `${(calculatedLoan.totalInterest / calculatedLoan.totalDue) * 100}%` }}
                    >
                      {((calculatedLoan.totalInterest / calculatedLoan.totalDue) * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-6 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-indigo-600 rounded"></div>
                  <span className="text-gray-600">Principal: ₹{loanAmount.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-orange-400 rounded"></div>
                  <span className="text-gray-600">Interest: ₹{calculatedLoan.totalInterest.toFixed(0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* EMI Schedule Table - only for loans ≥ ₹15,000 */}
            {loanAmount >= 15000 && <div className="bg-white rounded-2xl shadow-xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">EMI Schedule</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Month</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">EMI</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Principal</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Interest</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emiSchedule.map((row, idx) => (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 text-gray-900 font-medium">{row.month}</td>
                        <td className="py-3 px-4 text-right text-gray-900">₹{row.emi.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-indigo-600 font-medium">₹{row.principal.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-orange-600 font-medium">₹{row.interest.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-gray-900 font-medium">₹{row.balance.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
}
