import { db } from "../server/db.js";
import { users, gigEarnings, gigPlatformConnections } from "../shared/schema.js";
import { eq, and, ne, sql } from "drizzle-orm";

async function createConnections() {
  const allUsers = await db.select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(ne(users.role, "admin"));

  let created = 0;

  for (const user of allUsers) {
    const userEarnings = await db.select({ platform: gigEarnings.platform })
      .from(gigEarnings)
      .where(eq(gigEarnings.userId, user.id));

    const platforms = [...new Set(userEarnings.map(e => e.platform))];

    for (const platform of platforms) {
      const [existing] = await db.select().from(gigPlatformConnections).where(
        and(
          eq(gigPlatformConnections.userId, user.id),
          eq(gigPlatformConnections.platform, platform),
          eq(gigPlatformConnections.status, "connected")
        )
      );

      if (!existing) {
        const username = user.fullName.toLowerCase().replace(/\s+/g, "_") +
          "_" + platform.toLowerCase().replace(/[^a-z0-9]/g, "");

        await db.insert(gigPlatformConnections).values({
          userId: user.id,
          platform,
          platformUsername: username,
          status: "connected",
          lastSyncAt: new Date(),
        });
        created++;
      }
    }
  }

  console.log(`Created ${created} platform connections`);
  process.exit(0);
}

createConnections().catch(console.error);
