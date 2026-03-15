import fs from "fs";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { gigEarnings, users, gigPlatformConnections } from "../../shared/schema.js";
import { eq, and, sql } from "drizzle-orm";

const CSV_PATH = path.resolve(process.cwd(), "data", "gig_earnings_100_users.csv");
const VALID_CURRENCIES = ["INR", "USD", "EUR", "GBP"];

let lastHash = "";
let isProcessing = false;

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

function getFileHash(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return crypto.createHash("md5").update(content).digest("hex");
  } catch {
    return "";
  }
}

async function importCSV() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    if (!fs.existsSync(CSV_PATH)) {
      console.log("[CSV Watcher] File not found:", CSV_PATH);
      return;
    }

    const currentHash = getFileHash(CSV_PATH);
    if (currentHash === lastHash) return;

    console.log("[CSV Watcher] CSV file changed, re-importing...");

    const csvData = fs.readFileSync(CSV_PATH, "utf-8");
    const lines = csvData.split("\n").filter(l => l.trim());

    if (lines.length < 2) {
      console.log("[CSV Watcher] CSV has no data rows");
      lastHash = currentHash;
      return;
    }

    const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z_]/g, ""));

    const nameIdx = header.indexOf("user_name");
    const emailIdx = header.indexOf("email");
    const platformIdx = header.indexOf("platform");
    const amountIdx = header.indexOf("amount");
    const currencyIdx = header.indexOf("currency");
    const descIdx = header.indexOf("description");
    const dateIdx = header.indexOf("earned_at");

    if (platformIdx === -1 || amountIdx === -1 || dateIdx === -1) {
      console.log("[CSV Watcher] CSV missing required columns: platform, amount, earned_at");
      lastHash = currentHash;
      return;
    }

    const csvEmails = new Set<string>();
    const csvUserPlatforms = new Map<string, Set<string>>();

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i]);
      if (emailIdx >= 0 && emailIdx < fields.length && fields[emailIdx]) {
        const email = fields[emailIdx].toLowerCase().trim();
        csvEmails.add(email);
        if (!csvUserPlatforms.has(email)) csvUserPlatforms.set(email, new Set());
        if (platformIdx < fields.length) csvUserPlatforms.get(email)!.add(fields[platformIdx]);
      }
    }

    const userCache = new Map<string, number>();
    for (const email of csvEmails) {
      const [existingUser] = await db.select().from(users).where(eq(users.email, email));
      if (existingUser) {
        userCache.set(email, existingUser.id);
      }
    }

    const userIds = [...userCache.values()];
    if (userIds.length > 0) {
      for (const userId of userIds) {
        await db.delete(gigEarnings).where(eq(gigEarnings.userId, userId));
      }
    }

    const connectionCache = new Set<string>();
    let earningsCreated = 0;
    let usersCreated = 0;
    let connectionsCreated = 0;
    let skipped = 0;

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
        skipped++;
        continue;
      }

      if (amount <= 0 || amount > 10000000) {
        skipped++;
        continue;
      }

      const currency = currencyIdx >= 0 ? fields[currencyIdx] || "INR" : "INR";
      if (!VALID_CURRENCIES.includes(currency.toUpperCase())) {
        skipped++;
        continue;
      }

      const description = descIdx >= 0 ? fields[descIdx] || "" : "";

      let userId: number;

      if (emailIdx >= 0 && fields[emailIdx]) {
        const email = fields[emailIdx].toLowerCase().trim();

        if (userCache.has(email)) {
          userId = userCache.get(email)!;
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
      } else {
        skipped++;
        continue;
      }

      await db.insert(gigEarnings).values({
        userId,
        platform,
        amount,
        currency,
        description,
        earnedAt,
      });
      earningsCreated++;

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

    lastHash = currentHash;
    console.log(`[CSV Watcher] Import complete: ${earningsCreated} earnings, ${usersCreated} new users, ${connectionsCreated} connections, ${skipped} skipped`);
  } catch (error) {
    console.error("[CSV Watcher] Import error:", error);
  } finally {
    isProcessing = false;
  }
}

export function startCSVWatcher() {
  if (!fs.existsSync(path.dirname(CSV_PATH))) {
    fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
  }

  lastHash = getFileHash(CSV_PATH);
  console.log(`[CSV Watcher] Watching ${CSV_PATH} for changes...`);

  fs.watchFile(CSV_PATH, { interval: 3000 }, (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs) {
      setTimeout(() => importCSV(), 500);
    }
  });

  if (fs.existsSync(CSV_PATH)) {
    console.log("[CSV Watcher] Initial CSV found, will import on first change");
  }
}
