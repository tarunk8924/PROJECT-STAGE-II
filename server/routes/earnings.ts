import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { gigEarnings, paymentHistory, users, gigPlatformConnections } from "../../shared/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { getAuthPayload } from "../middleware/auth.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const router = Router();

router.post("/gig", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const userId = auth.userId;

    const { platform, amount, description, earnedAt } = req.body;

    if (!platform || !amount) {
      return res.status(400).json({ error: "Platform and amount are required" });
    }

    const [earning] = await db.insert(gigEarnings).values({
      userId,
      platform,
      amount: parseFloat(amount),
      description,
      earnedAt: new Date(earnedAt || Date.now()),
    }).returning();

    res.status(201).json(earning);
  } catch (error) {
    console.error("Error adding gig earning:", error);
    res.status(500).json({ error: "Failed to add gig earning" });
  }
});

router.get("/gig", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const userId = auth.userId;

    const earnings = await db.select().from(gigEarnings)
      .where(eq(gigEarnings.userId, userId))
      .orderBy(desc(gigEarnings.earnedAt));

    res.json(earnings);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch earnings" });
  }
});

router.post("/payment", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const userId = auth.userId;

    const { type, amount, from, to, reference, transactedAt } = req.body;

    const [payment] = await db.insert(paymentHistory).values({
      userId,
      type,
      amount: parseFloat(amount),
      from,
      to,
      reference,
      transactedAt: new Date(transactedAt || Date.now()),
    }).returning();

    res.status(201).json(payment);
  } catch (error) {
    res.status(500).json({ error: "Failed to add payment" });
  }
});

router.get("/payment", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const userId = auth.userId;

    const payments = await db.select().from(paymentHistory)
      .where(eq(paymentHistory.userId, userId))
      .orderBy(desc(paymentHistory.transactedAt));

    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

const MAX_CSV_ROWS = 5000;
const VALID_CURRENCIES = ["INR", "USD", "EUR", "GBP"];

router.post("/csv-upload", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { csvData } = req.body;
    if (!csvData || typeof csvData !== "string") {
      return res.status(400).json({ error: "CSV data is required" });
    }

    const lines = csvData.split("\n").filter((l: string) => l.trim());
    if (lines.length < 2) {
      return res.status(400).json({ error: "CSV must have a header row and at least one data row" });
    }

    if (lines.length - 1 > MAX_CSV_ROWS) {
      return res.status(400).json({ error: `CSV exceeds maximum of ${MAX_CSV_ROWS} data rows` });
    }

    const header = parseCSVLine(lines[0]).map((h: string) => h.toLowerCase().replace(/[^a-z_]/g, ""));

    const nameIdx = header.indexOf("user_name");
    const emailIdx = header.indexOf("email");
    const platformIdx = header.indexOf("platform");
    const amountIdx = header.indexOf("amount");
    const currencyIdx = header.indexOf("currency");
    const descIdx = header.indexOf("description");
    const dateIdx = header.indexOf("earned_at");

    if (platformIdx === -1 || amountIdx === -1 || dateIdx === -1) {
      return res.status(400).json({
        error: "CSV must have columns: platform, amount, earned_at. Optional: user_name, email, currency, description"
      });
    }

    const isAdmin = auth.role === "admin";

    if (!isAdmin && emailIdx >= 0) {
      const hasOtherEmails = lines.slice(1).some(line => {
        const fields = parseCSVLine(line);
        return emailIdx < fields.length && fields[emailIdx].trim() !== "";
      });
      if (hasOtherEmails) {
        return res.status(403).json({ error: "Only admins can import earnings for other users. Remove the email column or leave it empty." });
      }
    }

    const userCache = new Map<string, number>();
    const connectionCache = new Set<string>();
    let created = 0;
    let skipped = 0;
    let usersCreated = 0;
    let connectionsCreated = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i]);
      if (fields.length < Math.max(platformIdx, amountIdx, dateIdx) + 1) {
        skipped++;
        continue;
      }

      const platform = fields[platformIdx];
      const amount = parseFloat(fields[amountIdx]);
      const earnedAt = new Date(fields[dateIdx]);

      if (!platform || isNaN(amount) || isNaN(earnedAt.getTime())) {
        errors.push(`Row ${i + 1}: Invalid data (platform=${platform}, amount=${fields[amountIdx]}, date=${fields[dateIdx]})`);
        skipped++;
        continue;
      }

      if (amount <= 0 || amount > 10000000) {
        errors.push(`Row ${i + 1}: Amount must be between 0 and 10,000,000`);
        skipped++;
        continue;
      }

      const currency = currencyIdx >= 0 ? fields[currencyIdx] || "INR" : "INR";
      if (!VALID_CURRENCIES.includes(currency.toUpperCase())) {
        errors.push(`Row ${i + 1}: Invalid currency "${currency}". Allowed: ${VALID_CURRENCIES.join(", ")}`);
        skipped++;
        continue;
      }

      const description = descIdx >= 0 ? fields[descIdx] || "" : "";

      let userId = auth.userId;

      if (isAdmin && emailIdx >= 0 && fields[emailIdx]) {
        const email = fields[emailIdx].toLowerCase().trim();

        if (userCache.has(email)) {
          userId = userCache.get(email)!;
        } else {
          const [existingUser] = await db.select().from(users).where(eq(users.email, email));
          if (existingUser) {
            userId = existingUser.id;
            userCache.set(email, userId);
          } else {
            const fullName = nameIdx >= 0 && fields[nameIdx] ? fields[nameIdx] : email.split("@")[0];
            const randomPassword = crypto.randomBytes(32).toString("hex");
            const hashedPassword = await bcrypt.hash(randomPassword, 10);

            const [newUser] = await db.insert(users).values({
              email,
              fullName,
              password: hashedPassword,
              role: "user",
              emailVerified: false,
            }).returning();

            userId = newUser.id;
            userCache.set(email, userId);
            usersCreated++;
          }
        }
      }

      await db.insert(gigEarnings).values({
        userId,
        platform,
        amount,
        currency,
        description,
        earnedAt,
      });
      created++;

      const connKey = `${userId}:${platform}`;
      if (!connectionCache.has(connKey)) {
        const [existingConn] = await db.select().from(gigPlatformConnections).where(
          and(
            eq(gigPlatformConnections.userId, userId),
            eq(gigPlatformConnections.platform, platform),
            eq(gigPlatformConnections.status, "connected")
          )
        );
        if (!existingConn) {
          const userName = nameIdx >= 0 && fields[nameIdx]
            ? fields[nameIdx].toLowerCase().replace(/\s+/g, "_")
            : `user_${userId}`;
          const platformUsername = `${userName}_${platform.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

          await db.insert(gigPlatformConnections).values({
            userId,
            platform,
            platformUsername,
            status: "connected",
            lastSyncAt: new Date(),
          });
          connectionsCreated++;
        }
        connectionCache.add(connKey);
      }
    }

    res.json({
      message: `CSV import completed`,
      totalRows: lines.length - 1,
      earningsCreated: created,
      usersCreated,
      connectionsCreated,
      skipped,
      errors: errors.slice(0, 10),
    });
  } catch (error: any) {
    console.error("CSV upload error:", error);
    res.status(500).json({ error: error.message || "Failed to process CSV" });
  }
});

router.get("/csv-template", (req: Request, res: Response) => {
  const template = `user_name,email,platform,amount,currency,description,earned_at
"Aarav Sharma","aarav.sharma@gmail.com","Upwork",5000.00,INR,"Web Development Project",2026-01-15
"Priya Patel","priya.patel@gmail.com","Fiverr",3500.50,INR,"Logo Design",2026-02-10
"Rahul Kumar","rahul.kumar@gmail.com","Freelancer.com",8000.00,INR,"Python Script Development",2026-03-01`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=gig_earnings_template.csv");
  res.send(template);
});

export default router;
