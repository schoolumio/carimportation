import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const pendingJobs = await prisma.job.count({ where: { status: { in: ["PENDING", "FAILED"] }, runAt: { lt: new Date(Date.now() - 10 * 60_000) } } });
    return NextResponse.json({ ok: true, db: "up", staleJobs: pendingJobs, paymentProvider: process.env.PAYMENT_PROVIDER ?? "SANDBOX" });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
