# MicroCredit - VS Code Local Setup Guide

## Prerequisites

Install the following before proceeding:

1. **Node.js** (v18 or higher) - https://nodejs.org/
2. **PostgreSQL** (v14 or higher) - https://www.postgresql.org/download/
3. **Git** - https://git-scm.com/
4. **VS Code** - https://code.visualstudio.com/

### Recommended VS Code Extensions
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- ES7+ React/Redux/React-Native snippets
- Solidity (by Juan Blanco)

---

## Step 1: Download the Project

### Option A: Download from Replit
1. Click the three-dot menu in the Replit file panel
2. Select "Download as ZIP"
3. Extract the ZIP to a folder on your computer

### Option B: Clone via Git
```bash
git clone <your-replit-git-url>
cd workspace
```

---

## Step 2: Install Dependencies

Open a terminal in VS Code (Ctrl + `) and run:

```bash
npm install
```

---

## Step 3: Set Up PostgreSQL Database

### Option A: Local PostgreSQL
1. Open pgAdmin or your PostgreSQL client
2. Create a new database:
```sql
CREATE DATABASE microcredit;
```
3. Note your connection details (host, port, user, password)

### Option B: Free Cloud PostgreSQL (Neon)
1. Go to https://neon.tech/ and create a free account
2. Create a new project and database
3. Copy the connection string from the dashboard

### Option C: Free Cloud PostgreSQL (Supabase)
1. Go to https://supabase.com/ and create a free account
2. Create a new project
3. Go to Settings > Database > Connection string (URI)
4. Copy the connection string

---

## Step 4: Create Environment File

Create a `.env` file in the project root:

```env
# REQUIRED - Database
DATABASE_URL=postgresql://username:password@localhost:5432/microcredit

# REQUIRED - JWT Authentication
SESSION_SECRET=your-random-secret-key-here-make-it-long-and-random

# OPTIONAL - Ethereum Blockchain (Sepolia Testnet)
# Without these, the app uses simulation mode (still fully functional)
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
DEPLOYER_PRIVATE_KEY=your-ethereum-wallet-private-key

# OPTIONAL - Google OAuth Sign-In
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# OPTIONAL - Microsoft OAuth Sign-In
MICROSOFT_CLIENT_ID=your-microsoft-app-client-id

# OPTIONAL - Razorpay Payment Gateway
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your-razorpay-key-secret

# OPTIONAL - OpenAI for AI Credit Scoring
OPENAI_API_KEY=sk-your-openai-api-key
```

### How to get each key:

**DATABASE_URL (Required):**
- Local: `postgresql://postgres:yourpassword@localhost:5432/microcredit`
- Neon: Copy from Neon dashboard
- Supabase: Copy from Supabase dashboard

**SESSION_SECRET (Required):**
- Generate a random string. You can run this in terminal:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**ETHEREUM_RPC_URL (Optional):**
- Go to https://infura.io/, create free account
- Create a new project, select Sepolia network
- Copy the HTTPS endpoint

**DEPLOYER_PRIVATE_KEY (Optional):**
- Install MetaMask browser extension
- Create/use a wallet on Sepolia testnet
- Export private key from MetaMask (Settings > Security > Export Private Key)
- Get free Sepolia ETH from https://sepoliafaucet.com/

**GOOGLE_CLIENT_ID (Optional):**
- Go to https://console.cloud.google.com/
- Create OAuth 2.0 credentials
- Add `http://localhost:5000` to authorized origins

**RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET (Optional):**
- Go to https://dashboard.razorpay.com/
- Create test mode API keys from Settings > API Keys

**OPENAI_API_KEY (Optional):**
- Go to https://platform.openai.com/api-keys
- Create a new API key

---

## Step 5: Push Database Schema

Run this command to create all database tables:

```bash
npm run db:push
```

You should see:
```
[+] Changes applied
```

This creates 17 tables: users, kyc_records, kycDocuments, gig_earnings, payment_history, loans, repayments, credit_score_history, wallets, smart_contracts, transactions, audit_logs, emiSchedules, p2pFunding, insurancePool, razorpayPayments, gigPlatformConnections.

---

## Step 6: Compile Smart Contract (Optional)

If you want to use blockchain features:

```bash
npx tsx scripts/compile.ts
```

This compiles the Solidity smart contract and generates ABI artifacts.

---

## Step 7: Run the Application

### Production Mode (recommended for testing):
```bash
npm run build && npm run dev
```

### Or run build and server separately:
```bash
# Terminal 1: Build frontend
npm run build

# Terminal 2: Start server
npm run dev
```

The application will start at: **http://localhost:5000**

---

## Step 8: Access the Application

Open your browser and go to: `http://localhost:5000`

### Demo Account:
- **Admin:** admin@microcredit.com / admin123
- **New Users:** Register via the registration page

### First-Time Setup:
The admin account is auto-created on first server start. If it doesn't exist, the server creates it automatically.

---

## Project Structure

```
microcredit/
├── client/                    # React Frontend
│   ├── src/
│   │   ├── components/        # Layout, shared components
│   │   ├── pages/             # All page components (20 pages)
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── CreditScore.tsx
│   │   │   ├── ApplyLoan.tsx
│   │   │   ├── MyLoans.tsx
│   │   │   ├── LoanDetails.tsx
│   │   │   ├── LoanCalculator.tsx
│   │   │   ├── ConnectWallet.tsx
│   │   │   ├── KYCVerification.tsx
│   │   │   ├── Earnings.tsx
│   │   │   ├── BorrowerAnalytics.tsx
│   │   │   ├── P2PLending.tsx
│   │   │   ├── ForgotPassword.tsx
│   │   │   ├── ResetPassword.tsx
│   │   │   ├── AdminDashboard.tsx
│   │   │   ├── AdminLoans.tsx
│   │   │   ├── AdminUsers.tsx
│   │   │   ├── InsurancePool.tsx
│   │   │   └── NetworkConfig.tsx
│   │   ├── lib/               # API client, auth context
│   │   ├── App.tsx            # Router configuration
│   │   ├── main.tsx           # Entry point
│   │   └── index.css          # Tailwind CSS
│   └── index.html             # HTML template
│
├── server/                    # Express Backend
│   ├── index.ts               # Server entry point
│   ├── db.ts                  # Database connection
│   ├── middleware/             # Auth middleware (JWT)
│   ├── routes/                # API route handlers (15 routes)
│   │   ├── auth.ts            # Login, register, OAuth, forgot/reset password
│   │   ├── kyc.ts             # KYC verification & documents
│   │   ├── earnings.ts        # Gig earnings
│   │   ├── score.ts           # AI credit scoring
│   │   ├── loans.ts           # Loan application & management
│   │   ├── repay.ts           # Repayment processing
│   │   ├── wallets.ts         # UPI/Bank linking with IFSC lookup
│   │   ├── calculator.ts      # Public loan calculator
│   │   ├── emi.ts             # EMI scheduling
│   │   ├── p2p.ts             # P2P lending
│   │   ├── insurance.ts       # Insurance pool
│   │   ├── gig-platforms.ts   # Gig platform connections
│   │   ├── razorpay.ts        # Razorpay payments
│   │   └── admin.ts           # Admin dashboard APIs
│   └── utils/
│       ├── blockchain.ts      # Ethereum integration
│       ├── creditScoring.ts   # AI credit scoring logic
│       └── defaultDetection.ts # Loan default detection
│
├── contracts/                 # Solidity Smart Contracts
│   ├── MicroCreditLoan.sol    # Main contract
│   └── artifacts/             # Compiled ABI & bytecode
│
├── shared/                    # Shared between frontend & backend
│   └── schema.ts              # Database schema (Drizzle ORM)
│
├── scripts/
│   └── compile.ts             # Contract compilation script
│
├── package.json               # Dependencies & scripts
├── tsconfig.json              # TypeScript configuration
├── vite.config.ts             # Vite bundler configuration
├── drizzle.config.ts          # Drizzle ORM configuration
└── .env                       # Environment variables (create this)
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build React frontend for production |
| `npm run dev` | Start Express server (serves API + built frontend) |
| `npm run db:push` | Push schema changes to database |
| `npx tsx scripts/compile.ts` | Compile Solidity smart contract |

---

## Troubleshooting

### "DATABASE_URL environment variable is required"
- Make sure your `.env` file exists in the project root
- Make sure `DATABASE_URL` is set correctly
- Install `dotenv` if not loading: The server uses `dotenv` to load `.env` automatically

### "Cannot find module" errors
- Run `npm install` again
- Make sure you're using Node.js v18+: `node --version`

### Database tables not created
- Run `npm run db:push`
- Check your DATABASE_URL is correct and the database exists

### Blockchain shows "Simulation Mode"
- This is normal if you haven't set ETHEREUM_RPC_URL and DEPLOYER_PRIVATE_KEY
- The app is fully functional in simulation mode

### Port 5000 already in use
- Kill the process: `npx kill-port 5000`
- Or change PORT in `server/index.ts`

### Google/Microsoft Sign-In not working
- These require valid OAuth credentials
- The buttons auto-hide when not configured
- Email/password login always works

### Razorpay not showing
- Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in `.env`
- The button auto-hides when not configured
- Wallet-based repayment always works

---

## Important Notes

1. **The app works without any optional keys.** You only need DATABASE_URL and SESSION_SECRET to run everything. Blockchain uses simulation, OAuth buttons hide, Razorpay hides, and credit scoring uses fallback calculations.

2. **Admin account is auto-seeded.** On first run, the server creates admin@microcredit.com / admin123 automatically.

3. **OTPs are displayed on-screen** for demo purposes (password reset links, wallet verification codes). In production, these would be sent via SMS/email.

4. **IFSC lookup uses Razorpay's free API** (https://ifsc.razorpay.com/) - this works without any Razorpay credentials.
