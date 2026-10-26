// Centralised, validated access to server-side environment variables.
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  DATA_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "DATA_ENCRYPTION_KEY must be 32 bytes hex (64 chars)"),
  STORAGE_DIR: z.string().default("./storage/private"),
  PAYMENT_PROVIDER: z.enum(["SANDBOX", "MANUAL_PILOT", "LIVE_PARTNER"]).default("SANDBOX"),
  SANDBOX_WEBHOOK_SECRET: z.string().min(16).default("sandbox-webhook-secret-change-me"),
  EMAIL_TRANSPORT: z.enum(["console", "smtp"]).default("console"),
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default("AutoVault <no-reply@example.com>"),
  SMS_PROVIDER: z.enum(["none", "console"]).default("none"),
  WHATSAPP_PROVIDER: z.enum(["none", "console"]).default("none"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.PAYMENT_PROVIDER === "LIVE_PARTNER") {
    // Live escrow requires a contracted, authorised partner adapter. See docs/INTEGRATIONS.md.
    throw new Error("LIVE_PARTNER payment provider is not implemented. Integrate an authorised partner first.");
  }
  cached = parsed.data;
  return cached;
}
