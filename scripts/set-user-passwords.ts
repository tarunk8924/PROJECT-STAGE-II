import { db } from "../server/db.js";
import { users, gigEarnings, gigPlatformConnections } from "../shared/schema.js";
import { eq, and, ne, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

async function setPasswords() {
  const knownPassword = "freelancer123";
  const hashedPassword = await bcrypt.hash(knownPassword, 10);

  const allUsers = await db.select({
    id: users.id,
    email: users.email,
    fullName: users.fullName,
    role: users.role,
  }).from(users).where(ne(users.role, "admin")).orderBy(users.id);

  const csvUsers = allUsers.filter(u => u.email.endsWith("@gmail.com"));

  let updated = 0;
  for (const user of csvUsers) {
    await db.update(users)
      .set({ password: hashedPassword, emailVerified: true })
      .where(eq(users.id, user.id));
    updated++;
  }

  const rows: string[] = ["name,email,password,earnings_count,connected_platforms"];

  for (const user of csvUsers) {
    const earningsCount = await db.select({ count: sql<number>`count(*)` })
      .from(gigEarnings)
      .where(eq(gigEarnings.userId, user.id));

    const platformConns = await db.select({ platform: gigPlatformConnections.platform })
      .from(gigPlatformConnections)
      .where(
        and(
          eq(gigPlatformConnections.userId, user.id),
          eq(gigPlatformConnections.status, "connected")
        )
      );

    const platformNames = platformConns.map(p => p.platform).join(" | ");

    rows.push(`"${user.fullName}","${user.email}","${knownPassword}",${earningsCount[0].count},"${platformNames}"`);
  }

  const outputPath = path.join(process.cwd(), "data", "user_login_credentials.csv");
  fs.writeFileSync(outputPath, rows.join("\n"), "utf-8");

  console.log(`Updated ${updated} users with password: ${knownPassword}`);
  console.log(`Credentials CSV saved to: ${outputPath}`);
  console.log(`Total users in CSV: ${csvUsers.length}`);

  process.exit(0);
}

setPasswords().catch(console.error);
