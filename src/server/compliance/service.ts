import { prisma, transaction } from "@/server/db";
import { encrypt } from "@/lib/crypto";
import { invalid, notFound, precondition } from "@/lib/errors";
import { type Actor, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit/audit";
import { reevaluateCompliance } from "@/server/orders/service";

export const ID_TYPES = ["NIN", "INTERNATIONAL_PASSPORT", "DRIVERS_LICENCE", "VOTERS_CARD"] as const;

/** Buyer submits identity details. The ID number is encrypted at rest; only the document is reviewed by staff. */
export async function submitIdentity(actor: Actor, input: { identityType: string; identityNumber: string; documentId: string; addressLine: string; city: string; state: string }) {
  if (!ID_TYPES.includes(input.identityType as never)) throw invalid("Select an identity document type.");
  if (!/^[A-Za-z0-9-]{6,20}$/.test(input.identityNumber.trim())) throw invalid("Enter a valid document number.");
  const doc = await prisma.document.findUnique({ where: { id: input.documentId } });
  if (!doc || doc.uploadedById !== actor.userId) throw precondition("Upload your identity document first.");
  await prisma.buyerProfile.upsert({
    where: { userId: actor.userId },
    create: { userId: actor.userId, identityType: input.identityType, identityNumberEnc: encrypt(input.identityNumber.trim()), identityDocumentId: doc.id, identityStatus: "PENDING", addressLine: input.addressLine, city: input.city, state: input.state },
    update: { identityType: input.identityType, identityNumberEnc: encrypt(input.identityNumber.trim()), identityDocumentId: doc.id, identityStatus: "PENDING", addressLine: input.addressLine, city: input.city, state: input.state },
  });
  await audit(prisma, { actor, action: "identity.submitted", entityType: "User", entityId: actor.userId, summary: `Identity submitted (${input.identityType})` });
}

export async function reviewIdentity(actor: Actor, userId: string, decision: "VERIFIED" | "REJECTED", notes: string) {
  requirePermission(actor, "compliance.review");
  if (actor.userId === userId) throw precondition("You cannot verify your own identity.");
  await transaction(async (tx) => {
    const p = await tx.buyerProfile.findUnique({ where: { userId } });
    if (!p || p.identityStatus !== "PENDING") throw notFound("Pending identity submission");
    await tx.buyerProfile.update({ where: { userId }, data: { identityStatus: decision, identityReviewedAt: new Date(), identityReviewedBy: actor.userId } });
    await audit(tx, { actor, action: "identity.reviewed", entityType: "User", entityId: userId, summary: `Identity ${decision}: ${notes}` });
    if (decision === "VERIFIED") {
      const orders = await tx.order.findMany({ where: { buyerId: userId, state: "COMPLIANCE_CHECK" } });
      for (const o of orders) await reevaluateCompliance(tx, o.id);
    }
  });
}
