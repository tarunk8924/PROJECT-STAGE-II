import { pgTable, serial, integer, text, timestamp, boolean, real, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: text("password").notNull().default(""),
  authProvider: varchar("auth_provider", { length: 20 }).default("local"),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  role: varchar("role", { length: 20 }).notNull().default("user"),
  creditScore: integer("credit_score").default(0),
  riskTier: varchar("risk_tier", { length: 20 }).default("Unscored"),
  reputationScore: integer("reputation_score").default(0),
  walletBalance: real("wallet_balance").default(0),
  isKycVerified: boolean("is_kyc_verified").default(false),
  preferredCurrency: varchar("preferred_currency", { length: 10 }).default("INR"),
  emailVerified: boolean("email_verified").default(false),
  emailOtp: varchar("email_otp", { length: 100 }),
  emailOtpExpiry: timestamp("email_otp_expiry"),
  resetToken: varchar("reset_token", { length: 100 }),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const kycRecords = pgTable("kyc_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  idType: varchar("id_type", { length: 50 }).notNull(),
  idNumber: varchar("id_number", { length: 100 }).notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  dateOfBirth: varchar("date_of_birth", { length: 20 }),
  address: text("address"),
  status: varchar("status", { length: 20 }).default("pending"),
  verificationMethod: varchar("verification_method", { length: 30 }),
  aadhaarVerified: boolean("aadhaar_verified").default(false),
  aadhaarOtp: varchar("aadhaar_otp", { length: 100 }),
  aadhaarOtpExpiry: timestamp("aadhaar_otp_expiry"),
  aadhaarClientId: varchar("aadhaar_client_id", { length: 100 }),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const gigEarnings = pgTable("gig_earnings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  platform: varchar("platform", { length: 100 }).notNull(),
  amount: real("amount").notNull(),
  currency: varchar("currency", { length: 10 }).default("INR"),
  description: text("description"),
  earnedAt: timestamp("earned_at").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const paymentHistory = pgTable("payment_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 50 }).notNull(),
  amount: real("amount").notNull(),
  from: varchar("from_account", { length: 255 }),
  to: varchar("to_account", { length: 255 }),
  status: varchar("status", { length: 20 }).default("completed"),
  reference: varchar("reference", { length: 100 }),
  transactedAt: timestamp("transacted_at").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  amount: real("amount").notNull(),
  interestRate: real("interest_rate").notNull(),
  tenure: integer("tenure").notNull(),
  purpose: text("purpose"),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  amountRepaid: real("amount_repaid").default(0),
  totalDue: real("total_due").notNull(),
  monthlyEmi: real("monthly_emi").notNull(),
  nextDueDate: timestamp("next_due_date"),
  contractHash: varchar("contract_hash", { length: 100 }),
  blockchainTxId: varchar("blockchain_tx_id", { length: 100 }),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
  disbursedAt: timestamp("disbursed_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const repayments = pgTable("repayments", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id),
  userId: integer("user_id").notNull().references(() => users.id),
  amount: real("amount").notNull(),
  isOnTime: boolean("is_on_time").default(true),
  transactionHash: varchar("transaction_hash", { length: 100 }),
  paidAt: timestamp("paid_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const creditScoreHistory = pgTable("credit_score_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  score: integer("score").notNull(),
  riskTier: varchar("risk_tier", { length: 20 }).notNull(),
  factors: text("factors"),
  calculatedAt: timestamp("calculated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const wallets = pgTable("wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 20 }).notNull(),
  label: varchar("label", { length: 100 }),
  upiId: varchar("upi_id", { length: 100 }),
  upiProvider: varchar("upi_provider", { length: 50 }),
  bankName: varchar("bank_name", { length: 100 }),
  branchName: varchar("branch_name", { length: 255 }),
  accountNumber: varchar("account_number", { length: 50 }),
  accountType: varchar("account_type", { length: 20 }),
  ifscCode: varchar("ifsc_code", { length: 20 }),
  accountHolder: varchar("account_holder", { length: 255 }),
  mobileNumber: varchar("mobile_number", { length: 15 }),
  isPrimary: boolean("is_primary").default(false),
  isVerified: boolean("is_verified").default(false),
  verificationCode: varchar("verification_code", { length: 10 }),
  codeExpiresAt: timestamp("code_expires_at"),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  loanId: integer("loan_id").references(() => loans.id),
  walletId: integer("wallet_id").references(() => wallets.id),
  type: varchar("type", { length: 30 }).notNull(),
  amount: real("amount").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  paymentMethod: varchar("payment_method", { length: 20 }),
  reference: varchar("reference", { length: 100 }),
  txHash: varchar("tx_hash", { length: 100 }),
  failureReason: text("failure_reason"),
  retryCount: integer("retry_count").default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at"),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  entity: varchar("entity", { length: 50 }).notNull(),
  entityId: integer("entity_id"),
  details: text("details"),
  ipAddress: varchar("ip_address", { length: 50 }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const smartContracts = pgTable("smart_contracts", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id),
  contractAddress: varchar("contract_address", { length: 100 }),
  borrower: varchar("borrower", { length: 255 }).notNull(),
  lender: varchar("lender", { length: 255 }).default("MicroCredit Platform"),
  amount: real("amount").notNull(),
  interestRate: real("interest_rate").notNull(),
  tenure: integer("tenure").notNull(),
  status: varchar("status", { length: 30 }).default("created"),
  contractHash: varchar("contract_hash", { length: 100 }),
  blockNumber: integer("block_number"),
  events: text("events"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const kycDocuments = pgTable("kyc_documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  docType: varchar("doc_type", { length: 50 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileData: text("file_data").notNull(),
  status: varchar("status", { length: 20 }).default("pending"),
  uploadedAt: timestamp("uploaded_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const emiSchedules = pgTable("emi_schedules", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id),
  userId: integer("user_id").notNull().references(() => users.id),
  dueDate: timestamp("due_date").notNull(),
  amount: real("amount").notNull(),
  status: varchar("status", { length: 20 }).default("upcoming"),
  paidAt: timestamp("paid_at"),
  reminderSentAt: timestamp("reminder_sent_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const p2pFunding = pgTable("p2p_funding", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id),
  lenderId: integer("lender_id").notNull().references(() => users.id),
  amount: real("amount").notNull(),
  status: varchar("status", { length: 20 }).default("committed"),
  returnAmount: real("return_amount"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insurancePool = pgTable("insurance_pool", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull().references(() => loans.id),
  type: varchar("type", { length: 20 }).notNull(),
  amount: real("amount").notNull(),
  balance: real("balance").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const razorpayPayments = pgTable("razorpay_payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  orderId: varchar("order_id", { length: 100 }).notNull(),
  paymentId: varchar("payment_id", { length: 100 }),
  signature: varchar("signature", { length: 255 }),
  amount: real("amount").notNull(),
  currency: varchar("currency", { length: 10 }).default("INR"),
  status: varchar("status", { length: 30 }).default("created"),
  method: varchar("method", { length: 50 }),
  description: text("description"),
  loanId: integer("loan_id").references(() => loans.id),
  receipt: varchar("receipt", { length: 100 }),
  errorCode: varchar("error_code", { length: 50 }),
  errorDescription: text("error_description"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  paidAt: timestamp("paid_at"),
});

export const gigPlatformConnections = pgTable("gig_platform_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  platform: varchar("platform", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).default("connected"),
  platformUsername: varchar("platform_username", { length: 255 }),
  profileUrl: varchar("profile_url", { length: 500 }),
  extractedMetrics: text("extracted_metrics"),
  lastSyncAt: timestamp("last_sync_at"),
  connectedAt: timestamp("connected_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
