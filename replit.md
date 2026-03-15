# Blockchain-Based Micro Credit System for Freelancers

## Overview
This project is a decentralized micro-lending platform designed to provide freelancers with access to small loans, bypassing the traditional credit history requirements. It leverages AI for credit scoring, utilizes Ethereum blockchain smart contracts (on the Sepolia testnet) for secure and transparent transactions, and incorporates a reputation system to incentivize responsible lending and repayment. Key features include peer-to-peer lending, an insurance pool, EMI scheduling, integration with gig platforms, and comprehensive borrower analytics. The vision is to empower freelancers by offering accessible financial services, fostering economic stability, and unlocking their market potential through a trustless and efficient lending ecosystem.

## User Preferences
I prefer clear and direct communication. When proposing changes, please explain the reasoning behind them, especially for architectural or significant code modifications. For new features or complex implementations, I appreciate a brief overview of the approach before diving into details. I expect iterative development with regular updates on progress. Do not make changes to files within the `node_modules` directory.

## System Architecture
The platform is built with a modern web stack: React 18 for the frontend (using Tailwind CSS for styling, Recharts for data visualization, and Lucide icons), Node.js with Express 5 for the backend (including JWT authentication), and PostgreSQL (Neon) with Drizzle ORM for database management. AI-powered credit scoring is integrated via OpenAI (with a local fallback). Blockchain functionalities are handled by Ethereum Sepolia testnet using `ethers.js` and Solidity smart contracts, with a SHA-256 simulation fallback if Ethereum credentials are not configured.

Core architectural decisions include:
- **Decentralized Lending**: Utilizes a `MicroCreditLoan.sol` smart contract on Ethereum for managing the loan lifecycle, including creation, approval, repayment, and default marking.
- **Credit Scoring**: A CIBIL-like credit scoring system (300-900) for freelancers, influenced by earnings stability, platform reputation, repayment history, work consistency, and identity verification. OpenAI GPT-4o-mini enhances scoring with a local fallback.
- **Authentication**: Supports email OTP verification, Google Sign-In, and Microsoft Sign-In, with server-side token verification for enhanced security.
- **KYC Verification**: Real-time Aadhaar verification using OTP via Firebase Phone Auth or MSG91 fallback, adhering to RBI mandates for digital lending.
- **Payment Gateway**: Integration with Razorpay for handling payments (UPI, bank accounts, cards) with real-time VPA verification and secure server-side signature verification.
- **Data Aggregation**: Features gig earnings tracking, payment history, and simulated connections to platforms like Upwork, Fiverr, and Freelancer.
- **Admin Module**: A comprehensive admin dashboard for user and loan management, analytics, contract monitoring, and insurance pool management.
- **Transaction Security**: All financial operations generate transaction records and audit logs.
- **Deployment**: A single Express server serves both the API and the built React frontend.
- **Persistent Contracts**: Deployed smart contract addresses are saved and reused across restarts.
- **Automated Processes**: Includes automated default detection (with a 15-day grace period) and triggers reputation penalties and on-chain status updates.

The UI/UX focuses on a clean, intuitive design facilitated by Tailwind CSS, with Recharts for clear data presentation.

## External Dependencies
- **Database**: PostgreSQL (via Neon)
- **ORM**: Drizzle ORM
- **AI**: OpenAI (for credit scoring)
- **Blockchain**: Ethereum Sepolia Testnet
- **Blockchain Library**: ethers.js
- **Smart Contract Language**: Solidity
- **Authentication**: Google Identity Services, Microsoft MSAL.js, `google-auth-library`, `jwks-rsa`, `jsonwebtoken`
- **Email Service**: Nodemailer (with SMTP support)
- **OTP Verification**: Firebase Phone Auth, Firebase Admin SDK, MSG91
- **Payment Gateway**: Razorpay (with `razorpay` npm package and Razorpay Checkout.js)