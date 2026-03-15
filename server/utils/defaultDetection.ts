import { db } from "../db.js";
import { loans, users, smartContracts, auditLogs } from "../../shared/schema.js";
import { eq, and, lt, not, inArray } from "drizzle-orm";
import { markDefaultBlockchain } from "./blockchain.js";

export async function checkAndMarkDefaults(): Promise<{ marked: number; checked: number }> {
  const now = new Date();
  const gracePeriodMs = 15 * 24 * 60 * 60 * 1000;

  const activeLoans = await db.select().from(loans)
    .where(and(eq(loans.status, "active")));

  let marked = 0;

  for (const loan of activeLoans) {
    if (!loan.nextDueDate) continue;

    const dueDate = new Date(loan.nextDueDate);
    const graceDeadline = new Date(dueDate.getTime() + gracePeriodMs);

    if (now > graceDeadline) {
      await db.update(loans).set({ status: "defaulted" }).where(eq(loans.id, loan.id));

      const [user] = await db.select().from(users).where(eq(users.id, loan.userId));
      if (user) {
        const newRep = Math.max(0, (user.reputationScore || 50) - 10);
        await db.update(users).set({ reputationScore: newRep }).where(eq(users.id, loan.userId));
      }

      const blockchainResult = await markDefaultBlockchain(loan.id);

      const [contract] = await db.select().from(smartContracts).where(eq(smartContracts.loanId, loan.id));
      if (contract) {
        const events = JSON.parse(contract.events || "[]");
        events.push(blockchainResult.event);
        await db.update(smartContracts).set({
          status: "defaulted",
          events: JSON.stringify(events),
          updatedAt: new Date(),
        }).where(eq(smartContracts.loanId, loan.id));
      }

      await db.insert(auditLogs).values({
        userId: loan.userId,
        action: "loan_defaulted",
        entity: "loan",
        entityId: loan.id,
        details: JSON.stringify({
          reason: "Payment overdue beyond grace period",
          dueDate: dueDate.toISOString(),
          outstanding: loan.totalDue - (loan.amountRepaid || 0),
          txHash: blockchainResult.txHash,
          onChain: blockchainResult.onChain,
        }),
      });

      marked++;
    }
  }

  return { marked, checked: activeLoans.length };
}
