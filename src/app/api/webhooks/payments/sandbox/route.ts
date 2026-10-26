// Signed, idempotent payment-provider webhook endpoint (sandbox provider).
import { NextResponse } from "next/server";
import { handlePaymentWebhook } from "@/server/payments/service";
import { SANDBOX_SIGNATURE_HEADER, SANDBOX_TIMESTAMP_HEADER } from "@/server/payments/sandbox";

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 64 * 1024) return NextResponse.json({ ok: false }, { status: 413 });
  const res = await handlePaymentWebhook("SANDBOX", raw, {
    [SANDBOX_SIGNATURE_HEADER]: req.headers.get(SANDBOX_SIGNATURE_HEADER),
    [SANDBOX_TIMESTAMP_HEADER]: req.headers.get(SANDBOX_TIMESTAMP_HEADER),
  });
  return NextResponse.json(res.body, { status: res.status });
}
