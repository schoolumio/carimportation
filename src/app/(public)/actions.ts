"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { act, errorMessage, fileFrom, str, strs } from "@/server/web/actions";
import { currentActor, requestContext, requireActor, setSessionCookie } from "@/server/web/session";
import { createQuoteForListing } from "@/server/quotes/service";
import { createInquiry, reportListing, toggleSaved } from "@/server/inventory/service";
import { createSourcingRequest } from "@/server/sourcing/service";
import { registerDealer, applyAsDealer } from "@/server/dealers/service";
import { login } from "@/server/auth/service";
import { rateLimit } from "@/server/auth/rate-limit";
import { invalid } from "@/lib/errors";
import { z } from "zod";

export async function requestQuoteAction(fd: FormData) {
  const listingId = str(fd, "listingId");
  const back = str(fd, "back") || "/vehicles";
  const actor = await currentActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(back)}`);
  let quoteId = "";
  try {
    quoteId = (await createQuoteForListing(actor, listingId, { selectedOptional: strs(fd, "optional") })).id;
  } catch (e) {
    redirect(`${back.split("?")[0]}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(`/checkout/${quoteId}`);
}

export async function toggleSaveAction(fd: FormData) {
  const actor = await currentActor();
  const back = str(fd, "back") || "/vehicles";
  if (!actor) redirect(`/login?next=${encodeURIComponent(back)}`);
  await toggleSaved(actor, str(fd, "listingId"));
  redirect(back);
}

export async function toggleCompareAction(fd: FormData) {
  const id = str(fd, "listingId");
  const jar = await cookies();
  const current = (jar.get("av_compare")?.value ?? "").split(",").filter(Boolean);
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id].slice(-4);
  jar.set("av_compare", next.join(","), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  redirect(str(fd, "back") || "/compare");
}

export async function inquiryAction(fd: FormData) {
  const back = str(fd, "back");
  const actor = await currentActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(back)}`);
  await act(back, () => createInquiry(actor, str(fd, "listingId"), str(fd, "message")), "Your question was sent. You'll be notified when the seller replies.");
}

export async function reportAction(fd: FormData) {
  const back = str(fd, "back");
  const actor = await currentActor();
  const ctx = await requestContext();
  await act(back, async () => {
    if (!rateLimit(`report:${ctx.ip}`, 5, 3600_000).ok) throw invalid("Too many reports. Try again later.");
    await reportListing(actor, str(fd, "listingId"), str(fd, "details"));
  }, "Thank you. Our trust & safety team will review this listing.");
}

export async function sourcingAction(fd: FormData) {
  const actor = await currentActor();
  const ctx = await requestContext();
  await act("/request-a-car", async () => {
    if (!rateLimit(`sourcing:${ctx.ip}`, 10, 3600_000).ok) throw invalid("Too many requests. Try again later.");
    await createSourcingRequest(actor, {
      contactName: str(fd, "contactName"), contactEmail: str(fd, "contactEmail"), contactPhone: str(fd, "contactPhone"), make: str(fd, "make"), model: str(fd, "model"),
      yearMin: Number(str(fd, "yearMin")), yearMax: Number(str(fd, "yearMax")), trim: str(fd, "trim"), maxMileage: str(fd, "maxMileage") ? Number(str(fd, "maxMileage")) : undefined,
      budgetMax: str(fd, "budgetMax").replace(/[,\s₦]/g, ""), preferredCountries: strs(fd, "countries"), fuelType: str(fd, "fuelType"), transmission: str(fd, "transmission"), notes: str(fd, "notes"),
    });
  }, actor ? "Request received. Offers will appear in your account under Sourcing." : "Request received. Create an account with the same email to receive and accept offers.");
}

export async function contactAction(fd: FormData) {
  const ctx = await requestContext();
  await act("/about", async () => {
    if (!rateLimit(`contact:${ctx.ip}`, 5, 3600_000).ok) throw invalid("Too many messages. Try again later.");
    const d = z.object({ name: z.string().trim().min(2).max(120), email: z.string().email(), subject: z.string().trim().min(3).max(200), message: z.string().trim().min(10).max(5000) }).parse({ name: str(fd, "name"), email: str(fd, "email"), subject: str(fd, "subject"), message: str(fd, "message") });
    await prisma.contactMessage.create({ data: d });
  }, "Message received. We usually reply within one business day.");
}

const dealerFields = (fd: FormData) => ({
  legalName: str(fd, "legalName"), tradingName: str(fd, "tradingName"), registrationNumber: str(fd, "registrationNumber"), taxId: str(fd, "taxId"),
  businessAddress: str(fd, "businessAddress"), city: str(fd, "city"), state: str(fd, "state"), country: "NG", phone: str(fd, "businessPhone") || str(fd, "phone"), email: str(fd, "businessEmail"),
  website: str(fd, "website"), bio: str(fd, "bio"), sourcingRelationships: str(fd, "sourcingRelationships"), tradingHistory: str(fd, "tradingHistory"),
  bankName: str(fd, "bankName"), bankAccountName: str(fd, "bankAccountName"), bankAccountNumber: str(fd, "bankAccountNumber"),
});

export async function dealerApplyAction(fd: FormData) {
  const actor = await currentActor();
  const ctx = await requestContext();
  await act("/dealers/apply", async () => {
    if (actor) {
      await applyAsDealer(actor, dealerFields(fd));
    } else {
      if (!rateLimit(`dealer-apply:${ctx.ip}`, 5, 3600_000).ok) throw invalid("Too many applications. Try again later.");
      await registerDealer({ fullName: str(fd, "fullName"), email: str(fd, "email"), password: str(fd, "password"), phone: str(fd, "phone") }, dealerFields(fd));
      const res = await login(str(fd, "email"), str(fd, "password"), ctx);
      await setSessionCookie(res.token);
    }
  }, "Application submitted. Upload your verification documents to continue.", "/dealer/onboarding");
}

export async function markNotificationsReadAction() {
  const actor = await requireActor();
  await prisma.notification.updateMany({ where: { userId: actor.userId, channel: "IN_APP", readAt: null }, data: { readAt: new Date() } });
  redirect("/account/notifications");
}

export { fileFrom };
