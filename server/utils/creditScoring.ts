import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface CreditInput {
  totalEarnings: number;
  monthlyAvgEarnings: number;
  earningConsistency: number;
  totalLoans: number;
  loansRepaid: number;
  loanDefaulted: number;
  onTimePayments: number;
  latePayments: number;
  reputationScore: number;
  accountAgeDays: number;
  isKycVerified: boolean;
  platformRating: number;
  platformCompletedJobs: number;
  platformJobSuccessScore: number;
  hasVerifiedUpi: boolean;
  connectedPlatformCount: number;
  monthsWithEarnings: number;
  totalMonthsTracked: number;
}

export interface FactorBreakdown {
  name: string;
  weight: string;
  rawScore: number;
  weightedScore: number;
  explanation: string;
  impact: "positive" | "negative" | "neutral";
}

export interface CreditResult {
  score: number;
  riskTier: string;
  factors: string[];
  factorBreakdown: FactorBreakdown[];
  recommendedLoanAmount: number;
  recommendedInterestRate: number;
  approvalProbability: number;
}

export function calculateCreditScoreLocal(input: CreditInput): CreditResult {
  const hasEarnings = input.totalEarnings > 0;
  const hasWallet = input.hasVerifiedUpi;
  const hasKyc = input.isKycVerified;
  const hasLoans = input.totalLoans > 0;
  const hasPlatform = input.connectedPlatformCount > 0;

  const hasActivity = hasEarnings || hasLoans || hasPlatform || hasWallet || hasKyc;

  if (!hasActivity) {
    return {
      score: 0,
      riskTier: "Unscored",
      factors: [
        "No financial activity recorded yet",
        "Add gig earnings to start building your credit score",
        "Complete KYC verification for a score boost",
        "Connect a UPI wallet and verify it",
        "Link your freelance platform profiles",
      ],
      factorBreakdown: [],
      recommendedLoanAmount: 0,
      recommendedInterestRate: 0,
      approvalProbability: 0,
    };
  }

  let earningsStabilityRaw = 0;
  if (input.totalEarnings > 0) {
    let earningsScore = 0;
    if (input.totalEarnings > 100000) earningsScore += 40;
    else if (input.totalEarnings > 50000) earningsScore += 30;
    else if (input.totalEarnings > 20000) earningsScore += 20;
    else if (input.totalEarnings > 5000) earningsScore += 10;
    else earningsScore += 5;

    if (input.monthlyAvgEarnings > 20000) earningsScore += 30;
    else if (input.monthlyAvgEarnings > 10000) earningsScore += 20;
    else if (input.monthlyAvgEarnings > 5000) earningsScore += 10;
    else if (input.monthlyAvgEarnings > 0) earningsScore += 5;

    earningsScore += Math.floor(input.earningConsistency * 30);

    earningsStabilityRaw = Math.min(100, earningsScore);
  }

  let platformReputationRaw = 0;
  if (input.connectedPlatformCount > 0 || input.platformRating > 0) {
    if (input.platformRating > 0) {
      platformReputationRaw += Math.min(40, Math.floor((input.platformRating / 5) * 40));
    }
    if (input.platformCompletedJobs > 0) {
      if (input.platformCompletedJobs > 50) platformReputationRaw += 30;
      else if (input.platformCompletedJobs > 20) platformReputationRaw += 20;
      else if (input.platformCompletedJobs > 5) platformReputationRaw += 10;
      else platformReputationRaw += 5;
    }
    if (input.platformJobSuccessScore > 0) {
      platformReputationRaw += Math.min(30, Math.floor(input.platformJobSuccessScore * 0.3));
    }
    platformReputationRaw = Math.min(100, platformReputationRaw);
  }

  let loanRepaymentRaw = 50;
  if (input.totalLoans > 0) {
    const repaymentRate = input.loansRepaid / input.totalLoans;
    loanRepaymentRaw = Math.floor(repaymentRate * 50);

    if (input.loanDefaulted > 0) {
      loanRepaymentRaw -= input.loanDefaulted * 20;
    }

    const totalPayments = input.onTimePayments + input.latePayments;
    if (totalPayments > 0) {
      const onTimeRate = input.onTimePayments / totalPayments;
      loanRepaymentRaw += Math.floor(onTimeRate * 50);
    } else {
      loanRepaymentRaw += 25;
    }

    if (input.latePayments > 0) {
      loanRepaymentRaw -= input.latePayments * 5;
    }

    loanRepaymentRaw = Math.max(0, Math.min(100, loanRepaymentRaw));
  }

  let workConsistencyRaw = 0;
  if (input.monthsWithEarnings > 0) {
    const consistencyRate = input.totalMonthsTracked > 0
      ? input.monthsWithEarnings / input.totalMonthsTracked
      : 0;
    workConsistencyRaw = Math.min(100, Math.floor(consistencyRate * 70));

    if (input.accountAgeDays > 365) workConsistencyRaw += 30;
    else if (input.accountAgeDays > 180) workConsistencyRaw += 20;
    else if (input.accountAgeDays > 90) workConsistencyRaw += 10;

    workConsistencyRaw = Math.min(100, workConsistencyRaw);
  }

  let identityVerificationRaw = 0;
  if (input.isKycVerified) identityVerificationRaw += 60;
  if (input.hasVerifiedUpi) identityVerificationRaw += 40;
  identityVerificationRaw = Math.min(100, identityVerificationRaw);

  const earningsWeighted = earningsStabilityRaw * 0.30;
  const platformWeighted = platformReputationRaw * 0.25;
  const repaymentWeighted = loanRepaymentRaw * 0.25;
  const consistencyWeighted = workConsistencyRaw * 0.10;
  const identityWeighted = identityVerificationRaw * 0.10;

  const totalWeighted = earningsWeighted + platformWeighted + repaymentWeighted + consistencyWeighted + identityWeighted;

  const score = Math.max(300, Math.min(900, Math.floor(300 + (totalWeighted / 100) * 600)));

  const factorBreakdown: FactorBreakdown[] = [
    {
      name: "Earnings Stability",
      weight: "30%",
      rawScore: earningsStabilityRaw,
      weightedScore: Math.round(earningsWeighted * 10) / 10,
      explanation: earningsStabilityRaw >= 70
        ? "Strong and stable income from gig platforms"
        : earningsStabilityRaw >= 40
          ? "Moderate earnings, could improve with more consistent work"
          : earningsStabilityRaw > 0
            ? "Low earnings detected — increase your gig activity to improve"
            : "No earnings recorded — connect platforms and sync earnings",
      impact: earningsStabilityRaw >= 50 ? "positive" : earningsStabilityRaw > 0 ? "neutral" : "negative",
    },
    {
      name: "Platform Reputation",
      weight: "25%",
      rawScore: platformReputationRaw,
      weightedScore: Math.round(platformWeighted * 10) / 10,
      explanation: platformReputationRaw >= 70
        ? "Excellent platform ratings and job completion record"
        : platformReputationRaw >= 40
          ? "Good platform presence — higher ratings and more jobs will improve score"
          : platformReputationRaw > 0
            ? "Limited platform activity — complete more jobs and maintain high ratings"
            : "No platform profile data — verify your freelancer profiles to boost score",
      impact: platformReputationRaw >= 50 ? "positive" : platformReputationRaw > 0 ? "neutral" : "negative",
    },
    {
      name: "Loan Repayment History",
      weight: "25%",
      rawScore: loanRepaymentRaw,
      weightedScore: Math.round(repaymentWeighted * 10) / 10,
      explanation: input.totalLoans === 0
        ? "No loan history yet — your first loan will establish this factor"
        : input.loanDefaulted > 0
          ? `${input.loanDefaulted} loan default(s) detected — this significantly reduces your score`
          : loanRepaymentRaw >= 70
            ? "Excellent repayment track record with on-time payments"
            : "Improve by making timely repayments on all loans",
      impact: input.loanDefaulted > 0 ? "negative" : loanRepaymentRaw >= 50 ? "positive" : "neutral",
    },
    {
      name: "Work Consistency",
      weight: "10%",
      rawScore: workConsistencyRaw,
      weightedScore: Math.round(consistencyWeighted * 10) / 10,
      explanation: workConsistencyRaw >= 70
        ? "Consistent monthly work pattern demonstrates reliability"
        : workConsistencyRaw >= 30
          ? "Moderate work consistency — earning every month will improve this"
          : workConsistencyRaw > 0
            ? "Irregular work pattern — try to maintain monthly earnings"
            : "No work history tracked yet — sync your platform earnings",
      impact: workConsistencyRaw >= 50 ? "positive" : workConsistencyRaw > 0 ? "neutral" : "negative",
    },
    {
      name: "Identity Verification",
      weight: "10%",
      rawScore: identityVerificationRaw,
      weightedScore: Math.round(identityWeighted * 10) / 10,
      explanation: identityVerificationRaw >= 80
        ? "Fully verified identity (KYC + UPI) — maximum trust score"
        : input.isKycVerified
          ? "KYC verified — add a verified UPI wallet for full score"
          : input.hasVerifiedUpi
            ? "UPI verified — complete KYC for higher identity score"
            : "No identity verification — complete KYC and verify your UPI wallet",
      impact: identityVerificationRaw >= 60 ? "positive" : identityVerificationRaw > 0 ? "neutral" : "negative",
    },
  ];

  let riskTier: string;
  if (score >= 750) riskTier = "Low";
  else if (score >= 600) riskTier = "Medium";
  else riskTier = "High";

  const factors: string[] = [];
  if (earningsStabilityRaw >= 50) factors.push("Strong gig earnings stability");
  else if (earningsStabilityRaw > 0) factors.push("Earnings detected but could be more stable");
  if (platformReputationRaw >= 50) factors.push("Good freelance platform reputation");
  if (input.loanDefaulted > 0) factors.push("Previous loan defaults detected — significant negative impact");
  if (input.onTimePayments > input.latePayments) factors.push("Good loan repayment behavior");
  if (input.latePayments > 0) factors.push("Late payments on record — reduces score");
  if (input.isKycVerified) factors.push("Identity verified via Aadhaar KYC");
  if (input.hasVerifiedUpi) factors.push("UPI wallet verified — identity trust increased");
  if (workConsistencyRaw >= 50) factors.push("Consistent monthly work pattern");
  if (input.accountAgeDays < 90) factors.push("New account — limited history available");

  let recommendedLoanAmount: number;
  if (score >= 750) recommendedLoanAmount = 50000;
  else if (score >= 600) recommendedLoanAmount = 25000;
  else recommendedLoanAmount = 10000;
  const earningsCap = input.monthlyAvgEarnings * 3;
  if (earningsCap > 0 && earningsCap < recommendedLoanAmount) {
    recommendedLoanAmount = Math.floor(earningsCap);
  }

  let recommendedInterestRate: number;
  if (riskTier === "Low") recommendedInterestRate = 8;
  else if (riskTier === "Medium") recommendedInterestRate = 12;
  else recommendedInterestRate = 18;
  if (input.reputationScore > 90) recommendedInterestRate -= 2;
  else if (input.reputationScore > 80) recommendedInterestRate -= 1;

  let approvalProbability: number;
  if (score >= 750) approvalProbability = 92;
  else if (score >= 700) approvalProbability = 80;
  else if (score >= 600) approvalProbability = 60;
  else if (score >= 500) approvalProbability = 35;
  else approvalProbability = 15;
  if (input.isKycVerified) approvalProbability = Math.min(100, approvalProbability + 5);

  return { score, riskTier, factors, factorBreakdown, recommendedLoanAmount, recommendedInterestRate, approvalProbability };
}

export async function calculateCreditScoreAI(input: CreditInput): Promise<CreditResult> {
  const hasEarnings = input.totalEarnings > 0;
  const hasWallet = input.hasVerifiedUpi;
  const hasKyc = input.isKycVerified;
  const hasLoans = input.totalLoans > 0;
  const hasPlatform = input.connectedPlatformCount > 0;

  const hasActivity = hasEarnings || hasLoans || hasPlatform || hasWallet || hasKyc;

  if (!hasActivity) {
    return calculateCreditScoreLocal(input);
  }

  try {
    const prompt = `You are a CIBIL-like credit scoring engine for Indian freelancers/gig workers. Analyze this financial data and return a JSON credit assessment.

Score range: 300-900. Use weighted factors:
1. Earnings Stability (30%): Total earnings, monthly average, consistency
2. Platform Reputation (25%): Rating, completed jobs, job success score
3. Loan Repayment History (25%): Repayment rate, on-time payments, defaults
4. Work Consistency (10%): Monthly work pattern, account age
5. Identity Verification (10%): KYC verified, UPI verified

Financial Data:
- Total Earnings: ₹${input.totalEarnings}
- Monthly Average Earnings: ₹${input.monthlyAvgEarnings}
- Earning Consistency: ${(input.earningConsistency * 100).toFixed(0)}%
- Platform Rating: ${input.platformRating}/5
- Completed Jobs: ${input.platformCompletedJobs}
- Job Success Score: ${input.platformJobSuccessScore}%
- Connected Platforms: ${input.connectedPlatformCount}
- Total Loans Taken: ${input.totalLoans}
- Loans Repaid: ${input.loansRepaid}
- Loans Defaulted: ${input.loanDefaulted}
- On-Time Payments: ${input.onTimePayments}
- Late Payments: ${input.latePayments}
- Months With Earnings: ${input.monthsWithEarnings}/${input.totalMonthsTracked}
- Reputation Score: ${input.reputationScore}/100
- Account Age: ${input.accountAgeDays} days
- KYC Verified: ${input.isKycVerified}
- UPI Verified: ${input.hasVerifiedUpi}

Return ONLY valid JSON: {"score": number, "riskTier": "Low|Medium|High", "factors": ["factor1", "factor2"], "recommendedLoanAmount": number, "recommendedInterestRate": number, "approvalProbability": number}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const result = JSON.parse(content);
      const localResult = calculateCreditScoreLocal(input);
      return {
        score: Math.max(300, Math.min(900, result.score)),
        riskTier: result.riskTier || "Medium",
        factors: result.factors || [],
        factorBreakdown: localResult.factorBreakdown,
        recommendedLoanAmount: result.recommendedLoanAmount || localResult.recommendedLoanAmount,
        recommendedInterestRate: result.recommendedInterestRate || localResult.recommendedInterestRate,
        approvalProbability: result.approvalProbability || localResult.approvalProbability,
      };
    }
  } catch (error) {
    console.error("AI credit scoring failed, using local calculation:", error);
  }

  return calculateCreditScoreLocal(input);
}
