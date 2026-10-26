"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { act, errorMessage, fileFrom, str } from "@/server/web/actions";
import { getSession, requireActor } from "@/server/web/session";
import { buyerAcceptVehicle, buyerCancel, getOrderForActor } from "@/server/orders/service";
import { attachBuyerProof, handlePaymentWebhook } from "@/server/payments/service";
import { simulateIncomingTransfer } from "@/server/payments/sandbox";
import { uploadDocument } from "@/server/documents/service";
import { raiseDispute, addDisputeEvidence, withdrawDispute } from "@/server/disputes/service";
import { buyerDecideCost } from "@/server/logistics/costs";
import { submitIdentity } from "@/server/compliance/service";
import { beginMfaEnrollment, changePassword, confirmMfaEnrollment, revokeSessionById } from "@/server/auth/service";
import { openConversation, replyConversation } from "@/server/support/service";
import { createQuoteForOffer } from "@/server/quotes/service";
import { declineOffer, cancelSourcingRequest } from "@/server/sourcing/service";
import { sha256 } from "@/lib/crypto";
import { invalid, precondition } from "@/lib/errors";
import { env } from "@/config/env";
import type { DisputeCategory } from "@prisma/client";

const orderPath = (id: string) => `/account/orders/${id}`;

/** SANDBOX ONLY: simulate the provider receiving the transfer and sending a signed webhook. */
export async function simulatePaymentAction(fd: FormData) {
  const actor = await requireActor();
  const intentId = str(fd, "intentId");
  const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId }, include: { order: true } });
  const back = intent ? orderPath(intent.orderId) : "/account/orders";
  await act(back, async () => {
    if (env().PAYMENT_PROVIDER !== "SANDBOX") throw precondition("Payment simulation is only available in the sandbox.");
    if (!intent || intent.order.buyerId !== actor.userId) throw invalid("Payment not found.");
    if (!["PENDING", "PARTIALLY_PAID"].includes(intent.status)) throw precondition("This payment is not awaiting funds.");
    const remaining = intent.amount.minus(intent.amountReceived);
    const sim = await simulateIncomingTransfer(intent.reference, str(fd, "mode") === "partial" ? remaining.dividedBy(2).toDecimalPlaces(2) : remaining, intent.currency);
    const res = await handlePaymentWebhook("SANDBOX", sim.rawBody, sim.headers);
    if (res.status !== 200) throw new Error(res.body.error ?? "Webhook failed");
  }, "Sandbox: the provider sent a signed payment webhook and it was verified.");
}

export async function uploadProofAction(fd: FormData) {
  const actor = await requireActor();
  const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: str(fd, "intentId") } });
  await act(orderPath(intent.orderId), async () => {
    const f = await fileFrom(fd, "file");
    if (!f) throw invalid("Choose a file.");
    const doc = await uploadDocument(actor, { ...f, category: "buyer-transfer-receipt", visibility: "BUYER_AND_INTERNAL", orderId: intent.orderId });
    await attachBuyerProof(actor, intent.id, doc.id, str(fd, "note"));
  }, "Receipt uploaded. Finance will check the bank statement — a receipt alone does not confirm payment.");
}

export async function cancelOrderAction(fd: FormData) {
  const actor = await requireActor();
  const id = str(fd, "orderId");
  await act(orderPath(id), () => buyerCancel(actor, id, str(fd, "reason")), "Order cancelled.");
}

export async function acceptVehicleAction(fd: FormData) {
  const actor = await requireActor();
  const id = str(fd, "orderId");
  await act(orderPath(id), async () => {
    if (str(fd, "confirm") !== "on") throw invalid("Confirm that you have inspected the vehicle.");
    await buyerAcceptVehicle(actor, id);
  }, "Thank you — vehicle accepted. Final settlement will now be processed.");
}

export async function uploadOrderDocAction(fd: FormData) {
  const actor = await requireActor();
  const id = str(fd, "orderId");
  await act(orderPath(id), async () => {
    await getOrderForActor(actor, id);
    const f = await fileFrom(fd, "file");
    if (!f) throw invalid("Choose a file.");
    await uploadDocument(actor, { ...f, category: str(fd, "category") || "buyer-upload", visibility: "BUYER_AND_INTERNAL", orderId: id });
  }, "Document uploaded.");
}

export async function raiseDisputeAction(fd: FormData) {
  const actor = await requireActor();
  const id = str(fd, "orderId");
  await act(orderPath(id), async () => {
    const f = await fileFrom(fd, "file");
    const doc = f ? await uploadDocument(actor, { ...f, category: "dispute-evidence", visibility: "ORDER_PARTIES", orderId: id }) : null;
    await raiseDispute(actor, { orderId: id, category: str(fd, "category") as DisputeCategory, description: str(fd, "description"), documentId: doc?.id });
  }, "Dispute opened. Eligible unreleased funds are on hold while we investigate.");
}

export async function disputeEvidenceAction(fd: FormData) {
  const actor = await requireActor();
  const disputeId = str(fd, "disputeId");
  const back = str(fd, "back");
  await act(back, async () => {
    const d = await prisma.dispute.findUniqueOrThrow({ where: { id: disputeId } });
    const f = await fileFrom(fd, "file");
    const doc = f ? await uploadDocument(actor, { ...f, category: "dispute-evidence", visibility: "ORDER_PARTIES", orderId: d.orderId }) : null;
    await addDisputeEvidence(actor, disputeId, str(fd, "note"), doc?.id);
  }, "Evidence added.");
}

export async function withdrawDisputeAction(fd: FormData) {
  const actor = await requireActor();
  await act(str(fd, "back"), () => withdrawDispute(actor, str(fd, "disputeId")), "Dispute withdrawn.");
}

export async function costDecisionAction(fd: FormData) {
  const actor = await requireActor();
  await act(orderPath(str(fd, "orderId")), () => buyerDecideCost(actor, str(fd, "costId"), str(fd, "decision") === "approve"), str(fd, "decision") === "approve" ? "Charge approved. Payment instructions have been issued." : "Charge rejected. Our team will contact you.");
}

export async function identityAction(fd: FormData) {
  const actor = await requireActor();
  await act("/account/profile", async () => {
    const f = await fileFrom(fd, "file");
    if (!f) throw invalid("Upload a clear image or PDF of your identity document.");
    const doc = await uploadDocument(actor, { ...f, category: "buyer-identity", visibility: "INTERNAL" });
    await submitIdentity(actor, { identityType: str(fd, "identityType"), identityNumber: str(fd, "identityNumber"), documentId: doc.id, addressLine: str(fd, "addressLine"), city: str(fd, "city"), state: str(fd, "state") });
  }, "Identity submitted for review. We'll notify you once it is verified.");
}

export async function beginMfaAction() {
  const actor = await requireActor();
  const secret = await beginMfaEnrollment(actor);
  redirect(`/account/profile?mfaSecret=${secret}`);
}

export async function confirmMfaAction(fd: FormData) {
  const actor = await requireActor();
  await act("/account/profile", () => confirmMfaEnrollment(actor, str(fd, "code").trim()), "Two-factor authentication enabled.");
}

export async function revokeSessionAction(fd: FormData) {
  const actor = await requireActor();
  await act("/account/profile", () => revokeSessionById(actor, str(fd, "sessionId")), "Session revoked.");
}

export async function changePasswordAction(fd: FormData) {
  const actor = await requireActor();
  const s = await getSession();
  await act("/account/profile", async () => {
    if (str(fd, "next") !== str(fd, "confirm")) throw invalid("New passwords do not match.");
    await changePassword(actor, str(fd, "current"), str(fd, "next"), s ? sha256(s.token) : undefined);
  }, "Password changed. Other sessions were signed out.");
}

export async function updateProfileAction(fd: FormData) {
  const actor = await requireActor();
  await act("/account/profile", async () => {
    const name = str(fd, "fullName").trim();
    if (name.length < 2) throw invalid("Enter your name.");
    await prisma.user.update({ where: { id: actor.userId }, data: { fullName: name, phone: str(fd, "phone") || null, timezone: str(fd, "timezone") || "Africa/Lagos" } });
  }, "Profile updated.");
}

export async function openSupportAction(fd: FormData) {
  const actor = await requireActor();
  let id = "";
  try {
    id = (await openConversation(actor, { subject: str(fd, "subject"), body: str(fd, "body"), orderId: str(fd, "orderId") || undefined })).id;
  } catch (e) {
    redirect(`/account/support?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(`/account/support/${id}`);
}

export async function replySupportAction(fd: FormData) {
  const actor = await requireActor();
  const id = str(fd, "conversationId");
  await act(`/account/support/${id}`, () => replyConversation(actor, id, str(fd, "body")), "Message sent.");
}

export async function acceptOfferAction(fd: FormData) {
  const actor = await requireActor();
  let qid = "";
  try {
    qid = (await createQuoteForOffer(actor, str(fd, "offerId"))).id;
  } catch (e) {
    redirect(`/account/sourcing?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(`/checkout/${qid}`);
}

export async function declineOfferAction(fd: FormData) {
  const actor = await requireActor();
  await act("/account/sourcing", () => declineOffer(actor, str(fd, "offerId")), "Offer declined.");
}

export async function cancelSourcingAction(fd: FormData) {
  const actor = await requireActor();
  await act("/account/sourcing", () => cancelSourcingRequest(actor, str(fd, "requestId")), "Request cancelled.");
}
