import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "./db.js";
import { users } from "../shared/schema.js";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import authRoutes from "./routes/auth.js";
import kycRoutes from "./routes/kyc.js";
import earningsRoutes from "./routes/earnings.js";
import scoreRoutes from "./routes/score.js";
import loanRoutes from "./routes/loans.js";
import repayRoutes from "./routes/repay.js";
import adminRoutes from "./routes/admin.js";
import walletRoutes from "./routes/wallets.js";
import calculatorRoutes from "./routes/calculator.js";
import emiRoutes from "./routes/emi.js";
import p2pRoutes from "./routes/p2p.js";
import insuranceRoutes from "./routes/insurance.js";
import gigPlatformRoutes from "./routes/gig-platforms.js";
import razorpayRoutes from "./routes/razorpay.js";
import { checkAndMarkDefaults } from "./utils/defaultDetection.js";
import { initBlockchain, isUsingRealBlockchain } from "./utils/blockchain.js";
import { startCSVWatcher } from "./utils/csvWatcher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/earnings", earningsRoutes);
app.use("/api/score", scoreRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/repay", repayRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/wallets", walletRoutes);
app.use("/api/calculator", calculatorRoutes);
app.use("/api/emi", emiRoutes);
app.use("/api/p2p", p2pRoutes);
app.use("/api/insurance", insuranceRoutes);
app.use("/api/gig-platforms", gigPlatformRoutes);
app.use("/api/razorpay", razorpayRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), blockchain: isUsingRealBlockchain() ? "ethereum_sepolia" : "simulation" });
});

const distPath = path.resolve(__dirname, "../dist");
app.use(express.static(distPath, {
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-cache");
  },
}));

app.get("/{*path}", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(distPath, "index.html"));
});

async function seedAdmin() {
  try {
    const [existingAdmin] = await db.select().from(users).where(eq(users.email, "admin@microcredit.com"));
    if (existingAdmin && !existingAdmin.emailVerified) {
      await db.update(users).set({ emailVerified: true }).where(eq(users.id, existingAdmin.id));
    }
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await db.insert(users).values({
        email: "admin@microcredit.com",
        password: hashedPassword,
        fullName: "System Admin",
        phone: "+91-9999999999",
        role: "admin",
        creditScore: 900,
        reputationScore: 100,
        isKycVerified: true,
        emailVerified: true,
      });
      console.log("Admin user created: admin@microcredit.com / admin123");
    }
  } catch (error) {
    console.error("Error seeding admin:", error);
  }
}

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`MicroCredit Server running on http://0.0.0.0:${PORT}`);
  await seedAdmin();
  await initBlockchain();

  setInterval(async () => {
    try {
      const result = await checkAndMarkDefaults();
      if (result.marked > 0) {
        console.log(`Default check: ${result.marked} loans marked as defaulted out of ${result.checked} active`);
      }
    } catch (err) {
      console.error("Default check error:", err);
    }
  }, 6 * 60 * 60 * 1000);

  setTimeout(async () => {
    try {
      await checkAndMarkDefaults();
    } catch (err) {
      console.error("Initial default check error:", err);
    }
  }, 5000);

  startCSVWatcher();
});
