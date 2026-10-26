import { prisma } from "@/server/db";
import { dec, sum } from "@/lib/money";
import { getConfig } from "@/server/admin/config";
import { ACCOUNTS, accountBalance, trialBalance } from "@/server/ledger/ledger";

const ACTIVE_STATES = ["ORDER_CREATED", "COMPLIANCE_CHECK", "AWAITING_PAYMENT", "FUNDS_CONFIRMED", "FUNDS_PROTECTED", "PURCHASE_AUTHORIZED", "PURCHASE_COMPLETED", "INSPECTION_COMPLETED", "EXPORT_PREPARATION", "SHIPMENT_BOOKED", "DEPARTED", "IN_TRANSIT", "ARRIVED_NIGERIA", "CUSTOMS_CLEARANCE", "RELEASED_FROM_PORT", "LOCAL_TRANSPORT", "READY_FOR_HANDOVER", "DELIVERED", "ACCEPTANCE_PERIOD", "ACCEPTED", "SETTLEMENT", "PURCHASE_FAILED", "INSPECTION_FAILED"] as const;

export async function adminOverview() {
  const staleDays = await getConfig("sla.milestoneStaleDays");
  const staleBefore = new Date(Date.now() - staleDays * 86400_000);
  const in21 = new Date(Date.now() + 21 * 86400_000);
  const [
    listingsPublished, listingsPending, activeOrders, orderValue, pendingManual, unreconciled, eligibleSettlements, approvalSettlements,
    upcomingArrivals, missingDocs, pendingDealers, complianceOpen, openDisputes, refundRequests, costApprovals, openFlags, staleOrders, revenue, stateCounts,
  ] = await Promise.all([
    prisma.vehicleListing.count({ where: { status: "PUBLISHED" } }),
    prisma.vehicleListing.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.order.count({ where: { state: { in: [...ACTIVE_STATES] } } }),
    prisma.order.aggregate({ where: { state: { in: [...ACTIVE_STATES] } }, _sum: { agreedTotal: true } }),
    prisma.providerTransaction.count({ where: { provider: "MANUAL_PILOT", status: "PENDING" } }),
    prisma.providerTransaction.count({ where: { reconciliation: { in: ["UNRECONCILED", "MISMATCHED"] }, status: "SUCCEEDED" } }),
    prisma.settlementInstruction.aggregate({ where: { status: "ELIGIBLE" }, _sum: { amount: true }, _count: true }),
    prisma.settlementInstruction.count({ where: { status: "APPROVAL_REQUESTED" } }),
    prisma.shipment.findMany({ where: { status: { in: ["DEPARTED", "IN_TRANSIT"] }, currentEtaStart: { lte: in21 } }, include: { order: true }, orderBy: { currentEtaStart: "asc" }, take: 10 }),
    prisma.document.count({ where: { reviewStatus: "PENDING" } }),
    prisma.dealerOrganization.count({ where: { status: { in: ["APPLICATION_SUBMITTED", "UNDER_REVIEW", "ADDITIONAL_INFO_REQUIRED"] } } }),
    prisma.complianceCheck.count({ where: { status: "REQUIRED" } }),
    prisma.dispute.count({ where: { status: { in: ["OPEN", "AWAITING_RESPONSE", "UNDER_INVESTIGATION"] } } }),
    prisma.refund.count({ where: { status: "REQUESTED" } }),
    prisma.costAdjustment.count({ where: { status: { in: ["PENDING_INTERNAL_REVIEW", "AWAITING_BUYER_APPROVAL"] } } }),
    prisma.listingFlag.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
    prisma.order.findMany({ where: { state: { in: [...ACTIVE_STATES] }, updatedAt: { lt: staleBefore } }, take: 10, orderBy: { updatedAt: "asc" } }),
    accountBalance(prisma, ACCOUNTS.platformRevenue("NGN").code),
    prisma.order.groupBy({ by: ["state"], _count: { _all: true } }),
  ]);
  const pendingIdentity = await prisma.buyerProfile.count({ where: { identityStatus: "PENDING" } });
  const awaitingPayment = await prisma.order.count({ where: { state: "AWAITING_PAYMENT" } });
  return {
    listingsPublished, listingsPending, activeOrders, orderValue: dec(orderValue._sum.agreedTotal), pendingManual, unreconciled,
    eligibleSettlementsAmount: dec(eligibleSettlements._sum.amount), eligibleSettlementsCount: eligibleSettlements._count, approvalSettlements,
    upcomingArrivals, missingDocs, pendingDealers, complianceOpen, pendingIdentity, openDisputes, refundRequests, costApprovals, openFlags, staleOrders,
    revenue, stateCounts: stateCounts.map((s) => ({ state: s.state, count: s._count._all })), awaitingPayment,
  };
}

export async function financeOverview() {
  const tb = await trialBalance();
  const held = await prisma.ledgerAccount.findMany({ where: { code: { startsWith: "LIAB:BUYER_FUNDS:" } } });
  const balances = await Promise.all(held.map((a) => accountBalance(prisma, a.code)));
  return { trialBalance: tb, totalBuyerFundsHeld: sum(balances) };
}

export async function shipmentPerformance() {
  const delivered = await prisma.shipment.findMany({ where: { actualArrival: { not: null }, originalEtaEnd: { not: null } }, select: { actualArrival: true, originalEtaEnd: true } });
  if (!delivered.length) return null;
  const late = delivered.filter((s) => s.actualArrival! > s.originalEtaEnd!).length;
  return { measured: delivered.length, onTimePercent: Math.round(((delivered.length - late) / delivered.length) * 100) };
}
