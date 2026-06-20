import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Prisma 7 requires a driver adapter. PrismaPg (node-postgres) works with Neon's
// standard Postgres connection string. URL comes from DATABASE_URL at runtime.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

const TRANSIENT_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "P1001", // can't reach database server
  "P1017", // server has closed the connection
]);
const TRANSIENT_RE = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|can't reach database|connection (closed|terminated|reset)|Closed the connection/i;

/**
 * Retry a DB read on transient connection failures. Neon's free tier scales to
 * zero; the FIRST connection after an idle period fails fast (~0.8s, which is
 * what triggers the compute to wake), then connections succeed once it's up
 * (~2s) — but the full wake can take several seconds. So we retry across a
 * ~8s window. Persistent outages still surface (re-thrown after the last
 * attempt) so the error boundary can show a graceful message.
 */
export async function dbRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      const msg = e instanceof Error ? e.message : String(e);
      const transient = TRANSIENT_CODES.has(code) || TRANSIENT_RE.test(msg);
      if (!transient || i >= attempts - 1) throw e;
      // grow the gap so the compute has time to finish waking: 0.4/0.8/1.2/1.5/1.5s
      await new Promise((r) => setTimeout(r, Math.min(1500, 400 * (i + 1))));
    }
  }
}
