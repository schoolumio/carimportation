// Private document storage. Files are never served from public URLs: downloads require an authenticated
// session, a record-level access check, and a short-lived HMAC-signed link bound to the requesting user.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Document, DocumentVisibility } from "@prisma/client";
import { prisma } from "@/server/db";
import { env } from "@/config/env";
import { hmac, randomToken, safeEqual, sha256 } from "@/lib/crypto";
import { invalid, notFound, forbidden } from "@/lib/errors";
import { type Actor, can, isStaff } from "@/server/auth/actor";
import { audit } from "@/server/audit/audit";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED: Record<string, (b: Buffer) => boolean> = {
  "application/pdf": (b) => b.subarray(0, 4).toString() === "%PDF",
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8,
  "image/png": (b) => b.subarray(1, 4).toString() === "PNG",
  "image/webp": (b) => b.subarray(8, 12).toString() === "WEBP",
  "video/mp4": (b) => b.subarray(4, 8).toString() === "ftyp",
};

export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

/** Local-disk adapter for development and single-node deployments. Swap for S3-compatible storage in production. */
export class LocalStorage implements StorageAdapter {
  constructor(private root: string) {}
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root))) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.resolve(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data, { mode: 0o600 });
  }
  async get(key: string) {
    return readFile(this.resolve(key));
  }
}

let storage: StorageAdapter | null = null;
export function getStorage(): StorageAdapter {
  if (!storage) storage = new LocalStorage(path.resolve(env().STORAGE_DIR));
  return storage;
}
export function setStorage(s: StorageAdapter) {
  storage = s;
}

export interface UploadInput {
  filename: string;
  mimeType: string;
  data: Buffer;
  category: string;
  visibility: DocumentVisibility;
  orderId?: string;
  listingId?: string;
  shipmentId?: string;
  dealerOrgId?: string;
  disputeId?: string;
}

/** Whether the actor may attach documents to the given parent record. */
async function canAttach(actor: Actor, input: UploadInput): Promise<boolean> {
  if (isStaff(actor)) return true;
  if (input.orderId) {
    const { canViewOrder } = await import("@/server/orders/service");
    const order = await prisma.order.findUnique({ where: { id: input.orderId } });
    return !!order && (await canViewOrder(actor, order));
  }
  if (input.listingId) {
    const l = await prisma.vehicleListing.findUnique({ where: { id: input.listingId } });
    return !!l?.dealerOrgId && actor.dealerOrgIds.includes(l.dealerOrgId);
  }
  if (input.dealerOrgId) return actor.dealerOrgIds.includes(input.dealerOrgId);
  return true; // personal documents (e.g. buyer identity) — owned by uploader
}

export async function uploadDocument(actor: Actor, input: UploadInput): Promise<Document> {
  if (!input.data.length) throw invalid("The file is empty.");
  if (input.data.length > MAX_UPLOAD_BYTES) throw invalid("Files must be 10 MB or smaller.");
  const check = ALLOWED[input.mimeType];
  if (!check) throw invalid("Unsupported file type. Upload PDF, JPEG, PNG, WebP or MP4.");
  if (!check(input.data)) throw invalid("File content does not match its declared type.");
  if (!(await canAttach(actor, input))) throw forbidden("You cannot attach documents to this record.");
  // Non-staff cannot publish documents publicly or mark them internal-only on someone else's record.
  const visibility = !isStaff(actor) && input.visibility === "PUBLIC_LISTING" && !input.listingId ? "INTERNAL" : input.visibility;
  const storageKey = `${new Date().toISOString().slice(0, 7)}/${randomToken(18)}`;
  await getStorage().put(storageKey, input.data);
  const doc = await prisma.document.create({
    data: {
      category: input.category.slice(0, 60), filename: input.filename.replace(/[^\w.\- ]+/g, "_").slice(0, 120), mimeType: input.mimeType,
      sizeBytes: input.data.length, sha256: sha256(input.data), storageKey, visibility, uploadedById: actor.userId,
      orderId: input.orderId, listingId: input.listingId, shipmentId: input.shipmentId, dealerOrgId: input.dealerOrgId, disputeId: input.disputeId,
    },
  });
  await audit(prisma, { actor, action: "document.uploaded", entityType: "Document", entityId: doc.id, summary: `${doc.category}: ${doc.filename} (${doc.visibility})` });
  return doc;
}

/** Record-level document access policy. */
export async function canAccessDocument(actor: Actor | null, doc: Document): Promise<boolean> {
  if (doc.visibility === "PUBLIC_LISTING" && doc.listingId) {
    const l = await prisma.vehicleListing.findUnique({ where: { id: doc.listingId } });
    if (l?.status === "PUBLISHED") return true;
  }
  if (!actor) return false;
  if (doc.uploadedById === actor.userId) return true;
  if (can(actor, "document.review") || can(actor, "order.view.all")) return true;
  if (doc.visibility === "INTERNAL") return false;

  if (doc.orderId) {
    const order = await prisma.order.findUnique({ where: { id: doc.orderId } });
    if (!order) return false;
    const isBuyer = order.buyerId === actor.userId;
    const isDealer = !!order.dealerOrgId && actor.dealerOrgIds.includes(order.dealerOrgId);
    const isPartner = (await prisma.shipmentAssignment.count({ where: { userId: actor.userId, shipment: { orderId: order.id } } })) > 0;
    switch (doc.visibility) {
      case "BUYER_AND_INTERNAL":
        return isBuyer;
      case "DEALER_AND_INTERNAL":
        return isDealer;
      case "ORDER_PARTIES":
        return isBuyer || isDealer || isPartner;
      default:
        return false;
    }
  }
  if (doc.dealerOrgId) return actor.dealerOrgIds.includes(doc.dealerOrgId) && doc.visibility !== "BUYER_AND_INTERNAL";
  if (doc.listingId) {
    const l = await prisma.vehicleListing.findUnique({ where: { id: doc.listingId } });
    return !!l?.dealerOrgId && actor.dealerOrgIds.includes(l.dealerOrgId);
  }
  return false;
}

const LINK_TTL_MS = 5 * 60 * 1000;

export function signDocumentLink(docId: string, userId: string | null, now = Date.now()) {
  const exp = now + LINK_TTL_MS;
  const sig = hmac(env().APP_SECRET, `doc.${docId}.${userId ?? "public"}.${exp}`);
  return `/api/documents/${docId}?exp=${exp}&sig=${sig}`;
}

export function verifyDocumentLink(docId: string, userId: string | null, exp: string, sig: string, now = Date.now()): boolean {
  const e = Number(exp);
  if (!Number.isFinite(e) || e < now || e > now + LINK_TTL_MS + 1000) return false;
  return safeEqual(sig, hmac(env().APP_SECRET, `doc.${docId}.${userId ?? "public"}.${e}`));
}

/** Issue a signed link after checking access. */
export async function documentLinkFor(actor: Actor | null, docId: string): Promise<string> {
  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc || !(await canAccessDocument(actor, doc))) throw notFound("Document");
  return signDocumentLink(doc.id, doc.visibility === "PUBLIC_LISTING" && !actor ? null : actor?.userId ?? null);
}

export async function readDocument(actor: Actor | null, docId: string) {
  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc || !(await canAccessDocument(actor, doc))) throw notFound("Document");
  const data = await getStorage().get(doc.storageKey);
  if (sha256(data) !== doc.sha256) throw new Error("Document integrity check failed");
  return { doc, data };
}

export async function reviewDocument(actor: Actor, docId: string, status: "ACCEPTED" | "REJECTED", notes?: string) {
  if (!can(actor, "document.review")) throw forbidden();
  await prisma.document.update({ where: { id: docId }, data: { reviewStatus: status, reviewedById: actor.userId, reviewNotes: notes } });
  await audit(prisma, { actor, action: "document.reviewed", entityType: "Document", entityId: docId, summary: `${status}${notes ? `: ${notes}` : ""}` });
}

export async function documentsForOrder(actor: Actor, orderId: string) {
  const shipmentIds = (await prisma.shipment.findMany({ where: { orderId }, select: { id: true } })).map((s) => s.id);
  const docs = await prisma.document.findMany({ where: { OR: [{ orderId }, { shipmentId: { in: shipmentIds } }] }, orderBy: { createdAt: "desc" } });
  const visible: (Document & { link: string })[] = [];
  for (const d of docs) if (await canAccessDocument(actor, d)) visible.push({ ...d, link: signDocumentLink(d.id, actor.userId) });
  return visible;
}
