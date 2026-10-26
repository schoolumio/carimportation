import type { Notification, User } from "@prisma/client";
import { env } from "@/config/env";

export interface ChannelResult {
  success: boolean;
  skipped?: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface ChannelAdapter {
  send(n: Notification, user: User): Promise<ChannelResult>;
}

class ConsoleEmail implements ChannelAdapter {
  async send(n: Notification, user: User): Promise<ChannelResult> {
    if (env().NODE_ENV !== "test") console.info(`[email:console] to=${user.email} subject="${n.subject}"\n${n.body}`);
    return { success: true, providerMessageId: `console-${n.id}` };
  }
}

class SmtpEmail implements ChannelAdapter {
  async send(n: Notification, user: User): Promise<ChannelResult> {
    const nodemailer = await import("nodemailer");
    const url = env().SMTP_URL;
    if (!url) return { success: false, error: "SMTP_URL not configured" };
    const transport = nodemailer.createTransport(url);
    const info = await transport.sendMail({ from: env().EMAIL_FROM, to: user.email, subject: n.subject, text: n.body });
    return { success: true, providerMessageId: info.messageId };
  }
}

class NotConfigured implements ChannelAdapter {
  constructor(private name: string) {}
  async send(): Promise<ChannelResult> {
    return { success: false, skipped: true, error: `${this.name} provider not configured` };
  }
}

class ConsoleMessage implements ChannelAdapter {
  constructor(private name: string) {}
  async send(n: Notification, user: User): Promise<ChannelResult> {
    if (!user.phone) return { success: false, skipped: true, error: "User has no phone number" };
    if (env().NODE_ENV !== "test") console.info(`[${this.name}:console] to=${user.phone} ${n.subject}: ${n.body}`);
    return { success: true, providerMessageId: `console-${n.id}` };
  }
}

let override: Partial<Record<string, ChannelAdapter>> = {};
/** Test hook to inject failing/fake adapters. */
export function setChannelAdapter(channel: string, adapter: ChannelAdapter | undefined) {
  override = { ...override, [channel]: adapter };
}

export function adapterFor(channel: string): ChannelAdapter {
  if (override[channel]) return override[channel]!;
  const e = env();
  switch (channel) {
    case "EMAIL":
      return e.EMAIL_TRANSPORT === "smtp" ? new SmtpEmail() : new ConsoleEmail();
    case "SMS":
      return e.SMS_PROVIDER === "console" ? new ConsoleMessage("sms") : new NotConfigured("SMS");
    case "WHATSAPP":
      // WhatsApp Business requires an approved Meta Business account and pre-approved templates.
      return e.WHATSAPP_PROVIDER === "console" ? new ConsoleMessage("whatsapp") : new NotConfigured("WhatsApp Business");
    default:
      return new NotConfigured(channel);
  }
}
