import { db } from "../db.js";
import { auditLogs } from "../../shared/schema.js";

export async function logAudit(params: {
  userId?: number | null;
  action: string;
  entity: string;
  entityId?: number | null;
  details?: Record<string, any> | null;
  ipAddress?: string | null;
}) {
  await db.insert(auditLogs).values({
    userId: params.userId ?? null,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId ?? null,
    details: params.details ? JSON.stringify(params.details) : null,
    ipAddress: params.ipAddress ?? null,
  });
}

export function parseAuditDetails(value?: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
