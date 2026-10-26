"use server";
import { redirect } from "next/navigation";
import { act, errorMessage, fileFrom, str } from "@/server/web/actions";
import { requireActor, requireStaff } from "@/server/web/session";
import { requirePermission } from "@/server/auth/actor";
import { transitionOrder } from "@/server/orders/engine";
import { reviewComplianceCheck } from "@/server/orders/service";
import { assignPartner, ensureShipment } from "@/server/logistics/service";
import { reviewCostAdjustment } from "@/server/logistics/costs";
import { reviewDocument, uploadDocument } from "@/server/documents/service";
import { approveRelease, requestRelease } from "@/server/settlement/settlement";
import { approveRefund, rejectRefund, requestRefund } from "@/server/payments/refunds";
import { approvePayout, rejectPayout } from "@/server/settlement/payouts";
import { approveManualCredit, recordManualCredit, rejectManualCredit } from "@/server/payments/service";
import { runReconciliation } from "@/server/payments/reconciliation";
import { assignDispute, decideDispute, addDisputeEvidence } from "@/server/disputes/service";
import { createListing, moderateListing, submitForReview, resolveFlag, setFeatured, updateListing, verifyFact } from "@/server/inventory/service";
import { changeDealerStatus, reviewCheck, setCommercialAgreement } from "@/server/dealers/service";
import { reviewIdentity } from "@/server/compliance/service";
import { addFxSnapshot, createStaffUser, grantRole, revokeRole, savePricingRule, setRuleActive, setRolePermission, setUserStatus, updateConfig, upsertDeliveryLocation, upsertSourceCountry, upsertTemplate, verifyPricingRule } from "@/server/admin/service";
import { replyConversation, setConversationStatus } from "@/server/support/service";
import { submitOffer } from "@/server/sourcing/service";
import { invalid } from "@/lib/errors";
import type { AssignmentRole, DealerStatus, DisputeOutcome, OrderState, Provenance, VerificationCheckType } from "@prisma/client";
import type { Permission, RoleKey } from "@/server/auth/permissions";
import type { ConfigKey } from "@/server/admin/config";

const back = (fd: FormData, d: string) => str(fd, "back") || d;

// Orders & logistics
export async function adminTransitionAction(fd: FormData) {
  const actor = await requireStaff();
  const id = str(fd, "orderId");
  await act(back(fd, `/admin/orders/${id}`), async () => {
    const f = await fileFrom(fd, "file");
    const ids = f ? [(await uploadDocument(actor, { ...f, category: str(fd, "category") || "milestone-evidence", visibility: "ORDER_PARTIES", orderId: id })).id] : [];
    await transitionOrder(actor, id, { to: str(fd, "to") as OrderState, description: str(fd, "description") || undefined, evidenceDocumentIds: ids });
  }, "Order updated.");
}
export async function createShipmentAction(fd: FormData) {
  const actor = await requireStaff();
  const id = str(fd, "orderId");
  await act(`/admin/orders/${id}`, () => ensureShipment(actor, id, { method: (str(fd, "method") || undefined) as never, originPort: str(fd, "originPort") || undefined, etaStart: str(fd, "etaStart") ? new Date(str(fd, "etaStart")) : undefined, etaEnd: str(fd, "etaEnd") ? new Date(str(fd, "etaEnd")) : undefined }), "Shipment record created.");
}
export async function assignPartnerAction(fd: FormData) {
  const actor = await requireStaff();
  await act(back(fd, "/admin/orders"), () => assignPartner(actor, str(fd, "shipmentId"), str(fd, "userId"), str(fd, "role") as AssignmentRole), "Partner assigned.");
}
export async function complianceAction(fd: FormData) {
  const actor = await requireStaff();
  await act(back(fd, "/admin/compliance"), () => reviewComplianceCheck(actor, str(fd, "checkId"), str(fd, "decision") as never, str(fd, "notes") || "Reviewed"), "Compliance check updated.");
}
export async function identityReviewAction(fd: FormData) {
  const actor = await requireStaff();
  await act("/admin/compliance", () => reviewIdentity(actor, str(fd, "userId"), str(fd, "decision") as never, str(fd, "notes") || "Reviewed against document"), "Identity reviewed.");
}
export async function costReviewAction(fd: FormData) {
  const actor = await requireStaff();
  await act(back(fd, "/admin/costs"), () => reviewCostAdjustment(actor, str(fd, "costId"), str(fd, "decision") as never, str(fd, "notes")), "Cost reviewed.");
}
export async function docReviewAction(fd: FormData) {
  const actor = await requireStaff();
  await act(back(fd, "/admin"), () => reviewDocument(actor, str(fd, "documentId"), str(fd, "status") as never, str(fd, "notes")), "Document reviewed.");
}
export async function adminUploadOrderDocAction(fd: FormData) {
  const actor = await requireStaff();
  const id = str(fd, "orderId");
  await act(`/admin/orders/${id}`, async () => {
    const f = await fileFrom(fd, "file");
    if (!f) throw invalid("Choose a file.");
    await uploadDocument(actor, { ...f, category: str(fd, "category"), visibility: str(fd, "visibility") as never, orderId: id });
  }, "Document uploaded.");
}

// Finance
export async function settlementRequestAction(fd: FormData) {
  const actor = await requireStaff();
  await act(back(fd, "/admin/finance"), () => requestRelease(actor, str(fd, "id")), "Release requested — a second finance user must approve.");
}
export async function settlementApproveAction(fd: FormData) {
  const actor = await requireStaff();
  await act(back(fd, "/admin/finance"), () => approveRelease(actor, str(fd, "id"), { externalRef: str(fd, "externalRef") || undefined }), "Settlement released.");
}
export async function refundRequestAction(fd: FormData) {
  const actor = await requireStaff();
  await act(back(fd, "/admin/finance"), () => requestRefund(actor, { orderId: str(fd, "orderId"), amount: str(fd, "amount"), reason: str(fd, "reason") }), "Refund requested.");
}
export async function refundApproveAction(fd: FormData) {
  const actor = await requireStaff();
  await act(back(fd, "/admin/finance"), () => approveRefund(actor, str(fd, "id"), { externalRef: str(fd, "externalRef") || undefined }), "Refund executed.");
}
export async function refundRejectAction(fd: FormData) {
  const actor = await requireStaff();
  await act(back(fd, "/admin/finance"), () => rejectRefund(actor, str(fd, "id"), str(fd, "reason") || "Rejected"), "Refund rejected.");
}
export async function payoutApproveAction(fd: FormData) {
  const actor = await requireStaff();
  await act("/admin/finance", () => approvePayout(actor, str(fd, "id"), { externalRef: str(fd, "externalRef") || undefined }), "Payout paid.");
}
export async function payoutRejectAction(fd: FormData) {
  const actor = await requireStaff();
  await act("/admin/finance", () => rejectPayout(actor, str(fd, "id"), str(fd, "notes") || "Rejected"), "Payout rejected.");
}
export async function manualRecordAction(fd: FormData) {
  const actor = await requireStaff();
  await act("/admin/finance", () => recordManualCredit(actor, { paymentIntentId: str(fd, "intentId"), amount: str(fd, "amount"), bankStatementRef: str(fd, "bankRef"), occurredAt: new Date(str(fd, "occurredAt") || Date.now()) }), "Bank credit recorded — awaiting second approval.");
}
export async function manualApproveAction(fd: FormData) {
  const actor = await requireStaff();
  await act("/admin/finance", () => (str(fd, "decision") === "reject" ? rejectManualCredit(actor, str(fd, "id"), str(fd, "reason") || "Not found on statement") : approveManualCredit(actor, str(fd, "id"))), "Manual payment decision recorded.");
}
export async function reconcileAction(fd: FormData) {
  const actor = await requireStaff();
  await act("/admin/finance", async () => {
    requirePermission(actor, "reconciliation.run");
    const hours = Number(str(fd, "hours") || 24);
    await runReconciliation(actor, "SANDBOX", new Date(Date.now() - hours * 3600_000), new Date());
  }, "Reconciliation run completed.");
}

// Disputes
export async function disputeAssignAction(fd: FormData) {
  const actor = await requireStaff();
  await act(`/admin/disputes/${str(fd, "id")}`, () => assignDispute(actor, str(fd, "id")), "Investigation started.");
}
export async function disputeDecideAction(fd: FormData) {
  const actor = await requireStaff();
  await act(`/admin/disputes/${str(fd, "id")}`, () => decideDispute(actor, str(fd, "id"), { outcome: str(fd, "outcome") as DisputeOutcome, notes: str(fd, "notes"), refundAmount: str(fd, "refundAmount") || undefined }), "Decision issued. Any refund still needs finance approval.");
}
export async function disputeNoteAction(fd: FormData) {
  const actor = await requireStaff();
  await act(`/admin/disputes/${str(fd, "id")}`, () => addDisputeEvidence(actor, str(fd, "id"), str(fd, "note")), "Note added.");
}

// Listings
export async function moderateAction(fd: FormData) {
  const actor = await requireStaff();
  await act(back(fd, "/admin/listings"), () => moderateListing(actor, str(fd, "listingId"), str(fd, "decision") as never, str(fd, "notes")), "Moderation decision saved.");
}
export async function verifyFactAction(fd: FormData) {
  const actor = await requireStaff();
  await act(back(fd, "/admin/listings"), () => verifyFact(actor, str(fd, "listingId"), str(fd, "field"), str(fd, "provenance") as Provenance, str(fd, "documentId") || null, str(fd, "notes")), "Fact provenance updated.");
}
export async function featureAction(fd: FormData) {
  const actor = await requireStaff();
  await act(back(fd, "/admin/listings"), () => setFeatured(actor, str(fd, "listingId"), str(fd, "featured") === "1"), "Updated.");
}
export async function flagAction(fd: FormData) {
  const actor = await requireStaff();
  await act(back(fd, "/admin/flags"), () => resolveFlag(actor, str(fd, "flagId"), str(fd, "status") as never, str(fd, "resolution") || "Reviewed"), "Flag resolved.");
}
function listingFromForm(fd: FormData) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$")) o[k] = v;
  for (const k of ["year", "mileage"]) o[k] = Number(o[k]);
  for (const k of ["engineCapacityCc", "doors", "seats"]) o[k] = o[k] ? Number(o[k]) : null;
  for (const k of ["price", "dealerFee"]) o[k] = String(o[k] ?? "").replace(/[,\s]/g, "") || (k === "dealerFee" ? "0" : "");
  for (const k of ["shipmentWindowStart", "shipmentWindowEnd", "estArrivalStart", "estArrivalEnd", "auctionDate", "storageDeadline"]) o[k] = o[k] || null;
  return o as never;
}
export async function adminCreateListingAction(fd: FormData) {
  const actor = await requireStaff();
  let id = "";
  try { id = (await createListing(actor, listingFromForm(fd))).id; } catch (e) { redirect(`/admin/listings/new?error=${encodeURIComponent(errorMessage(e))}`); }
  redirect(`/admin/listings/${id}?ok=${encodeURIComponent("Platform listing created as draft.")}`);
}
export async function adminUpdateListingAction(fd: FormData) {
  const actor = await requireStaff();
  const id = str(fd, "listingId");
  await act(`/admin/listings/${id}`, () => updateListing(actor, id, listingFromForm(fd)), "Listing updated.");
}
export async function adminSubmitListingAction(fd: FormData) {
  const actor = await requireStaff();
  const id = str(fd, "listingId");
  await act(`/admin/listings/${id}`, () => submitForReview(actor, id), "Submitted to the moderation queue (a different moderator should approve).");
}

// Dealers
export async function dealerCheckAction(fd: FormData) {
  const actor = await requireStaff();
  const id = str(fd, "orgId");
  await act(`/admin/dealers/${id}`, () => reviewCheck(actor, id, str(fd, "checkType") as VerificationCheckType, str(fd, "status") as never, str(fd, "notes") || "Reviewed"), "Check updated.");
}
export async function dealerStatusAction(fd: FormData) {
  const actor = await requireStaff();
  const id = str(fd, "orgId");
  await act(`/admin/dealers/${id}`, () => changeDealerStatus(actor, id, str(fd, "status") as DealerStatus, str(fd, "notes")), "Dealer status updated.");
}
export async function agreementAction(fd: FormData) {
  const actor = await requireStaff();
  const id = str(fd, "orgId");
  await act(`/admin/dealers/${id}`, () => setCommercialAgreement(actor, id, { commissionPercent: str(fd, "commissionPercent"), fixedFeePerSale: str(fd, "fixedFeePerSale"), subscriptionPlan: str(fd, "subscriptionPlan"), notes: str(fd, "notes") }), "Agreement saved.");
}

// Pricing & settings
export async function pricingRuleAction(fd: FormData) {
  const actor = await requireStaff();
  await act("/admin/pricing", () => savePricingRule(actor, {
    code: str(fd, "code"), label: str(fd, "label"), category: str(fd, "category"), calcType: str(fd, "calcType") as never, amount: str(fd, "amount"), currency: str(fd, "currency"),
    percent: str(fd, "percent"), conditions: str(fd, "conditions") || "{}", nature: str(fd, "nature") as never, refundable: str(fd, "refundable") === "on", beneficiary: str(fd, "beneficiary"),
    payableStage: (str(fd, "payableStage") || "UPFRONT") as never, uncertaintyPercent: str(fd, "uncertaintyPercent") || "0", sourceReference: str(fd, "sourceReference"),
    optional: str(fd, "optional") === "on", effectiveFrom: str(fd, "effectiveFrom") ? new Date(str(fd, "effectiveFrom")) : new Date(),
  }), "New rule version saved (unverified until a second administrator verifies it).");
}
export async function verifyRuleAction(fd: FormData) {
  const actor = await requireStaff();
  await act("/admin/pricing", () => verifyPricingRule(actor, str(fd, "ruleId")), "Rule verified.");
}
export async function ruleActiveAction(fd: FormData) {
  const actor = await requireStaff();
  await act("/admin/pricing", () => setRuleActive(actor, str(fd, "ruleId"), str(fd, "active") === "1"), "Rule updated.");
}
export async function fxAction(fd: FormData) {
  const actor = await requireStaff();
  await act("/admin/pricing", () => addFxSnapshot(actor, { base: str(fd, "base"), rate: str(fd, "rate"), source: str(fd, "source") }), "Exchange-rate snapshot recorded.");
}
export async function configAction(fd: FormData) {
  const actor = await requireStaff();
  await act("/admin/settings", () => updateConfig(actor, str(fd, "key") as ConfigKey, str(fd, "value")), "Setting updated.");
}
export async function countryAction(fd: FormData) {
  const actor = await requireStaff();
  await act("/admin/settings", () => upsertSourceCountry(actor, { code: str(fd, "code").toUpperCase(), name: str(fd, "name"), active: str(fd, "active") === "on", originPorts: str(fd, "originPorts").split(",").map((s) => s.trim()).filter(Boolean), transitDaysMin: Number(str(fd, "min")), transitDaysMax: Number(str(fd, "max")) }), "Source country saved.");
}
export async function locationAction(fd: FormData) {
  const actor = await requireStaff();
  await act("/admin/settings", () => upsertDeliveryLocation(actor, { code: str(fd, "code").toUpperCase(), name: str(fd, "name"), state: str(fd, "state"), active: str(fd, "active") === "on" }), "Delivery location saved.");
}
export async function templateAction(fd: FormData) {
  const actor = await requireStaff();
  await act("/admin/settings", () => upsertTemplate(actor, { key: str(fd, "key"), channel: str(fd, "channel") as never, subject: str(fd, "subject"), body: str(fd, "body"), active: str(fd, "active") === "on" }), "Template saved.");
}

// Users
export async function roleAction(fd: FormData) {
  const actor = await requireStaff();
  await act(back(fd, "/admin/users"), () => (str(fd, "op") === "grant" ? grantRole(actor, str(fd, "userId"), str(fd, "role") as RoleKey) : revokeRole(actor, str(fd, "userId"), str(fd, "role") as RoleKey)), "Roles updated; the user's sessions were revoked.");
}
export async function userStatusAction(fd: FormData) {
  const actor = await requireStaff();
  await act(back(fd, "/admin/users"), () => setUserStatus(actor, str(fd, "userId"), str(fd, "status") as never), "User status updated.");
}
export async function createStaffAction(fd: FormData) {
  const actor = await requireStaff();
  await act("/admin/users", () => createStaffUser(actor, { email: str(fd, "email"), fullName: str(fd, "fullName"), password: str(fd, "password"), role: str(fd, "role") as RoleKey }), "Staff account created.");
}
export async function rolePermAction(fd: FormData) {
  const actor = await requireStaff();
  await act("/admin/users/roles", () => setRolePermission(actor, str(fd, "role") as RoleKey, str(fd, "permission") as Permission, str(fd, "granted") === "1"), "Permission updated.");
}

// Support & sourcing
export async function supportReplyAction(fd: FormData) {
  const actor = await requireStaff();
  const id = str(fd, "id");
  await act(`/admin/support/${id}`, () => replyConversation(actor, id, str(fd, "body"), str(fd, "internal") === "on"), "Reply saved.");
}
export async function supportStatusAction(fd: FormData) {
  const actor = await requireStaff();
  const id = str(fd, "id");
  await act(`/admin/support/${id}`, () => setConversationStatus(actor, id, str(fd, "status") as never, str(fd, "priority") || undefined), "Status updated.");
}
export async function platformOfferAction(fd: FormData) {
  const actor = await requireActor();
  await act("/admin/sourcing", () => submitOffer(actor, str(fd, "requestId"), {
    vehicleDescription: str(fd, "vehicleDescription"), year: Number(str(fd, "year")), mileage: str(fd, "mileage") ? Number(str(fd, "mileage")) : undefined, sourceCountry: str(fd, "sourceCountry"),
    vehiclePrice: str(fd, "vehiclePrice"), vehicleCurrency: str(fd, "vehicleCurrency") as never, shippingMethod: "RORO", timelineNotes: str(fd, "timelineNotes"), conditionNotes: str(fd, "conditionNotes"), validDays: 7,
  }, null), "Platform offer sent.");
}
