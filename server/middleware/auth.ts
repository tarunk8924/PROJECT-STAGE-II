import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET;

if (!JWT_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

export interface AuthPayload {
  userId: number;
  role: string;
}

export function getAuthPayload(req: Request): AuthPayload | null {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token || !JWT_SECRET) return null;
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuthPayload(req);
  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).auth = auth;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getAuthPayload(req);
  if (!auth || auth.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  (req as any).auth = auth;
  next();
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: "7d" });
}

export { JWT_SECRET };
