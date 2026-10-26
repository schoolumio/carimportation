import { prisma } from "@/server/db";
import { forbidden, invalid, notFound } from "@/lib/errors";
import { type Actor, can } from "@/server/auth/actor";
import { notify } from "@/server/notifications/notify";
import { canViewOrder } from "@/server/orders/service";
import { audit } from "@/server/audit/audit";

export async function openConversation(actor: Actor, input: { subject: string; body: string; orderId?: string }) {
  if (input.subject.trim().length < 3 || input.body.trim().length < 5) throw invalid("Add a subject and a message.");
  if (input.orderId) {
    const o = await prisma.order.findUnique({ where: { id: input.orderId } });
    if (!o || !(await canViewOrder(actor, o))) throw notFound("Order");
  }
  return prisma.supportConversation.create({
    data: { subject: input.subject.trim().slice(0, 200), orderId: input.orderId || null, createdById: actor.userId, messages: { create: { authorId: actor.userId, body: input.body.trim().slice(0, 5000) } } },
  });
}

export async function getConversation(actor: Actor, id: string) {
  const c = await prisma.supportConversation.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: "asc" } }, createdBy: true } });
  if (!c) throw notFound("Conversation");
  const staff = can(actor, "support.manage");
  if (!staff && c.createdById !== actor.userId) throw notFound("Conversation");
  return { ...c, messages: staff ? c.messages : c.messages.filter((m) => !m.internalNote) };
}

export async function replyConversation(actor: Actor, id: string, body: string, internalNote = false) {
  const c = await getConversation(actor, id);
  const staff = can(actor, "support.manage");
  if (internalNote && !staff) throw forbidden();
  if (body.trim().length < 1) throw invalid("Message is empty.");
  await prisma.supportMessage.create({ data: { conversationId: id, authorId: actor.userId, body: body.trim().slice(0, 5000), internalNote } });
  await prisma.supportConversation.update({ where: { id }, data: { status: staff ? (internalNote ? c.status : "PENDING_CUSTOMER") : "OPEN", ...(staff && !c.assignedToId ? { assignedToId: actor.userId } : {}) } });
  if (staff && !internalNote) await notify(prisma, { userId: c.createdById, templateKey: "support.reply", dedupeKey: `support:${id}:${Date.now()}`, vars: { subject: c.subject, body }, link: `/account/support/${id}` });
}

export async function setConversationStatus(actor: Actor, id: string, status: "OPEN" | "ESCALATED" | "RESOLVED", priority?: string) {
  if (!can(actor, "support.manage")) throw forbidden();
  await prisma.supportConversation.update({ where: { id }, data: { status, ...(priority ? { priority } : {}) } });
  await audit(prisma, { actor, action: "support.status", entityType: "SupportConversation", entityId: id, summary: `Status ${status}` });
}
