import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedPricing, makeUser, uploadOrderDoc, prisma } from "./helpers";
import { createPaidOrder } from "./flow";
import { D, sum } from "@/lib/money";
import { buildSettlementPlan, requestRelease, approveRelease } from "@/server/settlement/settlement";
import { transitionOrder } from "@/server/orders/engine";
import { requestRefund, approveRefund } from "@/server/payments/refunds";
import { raiseDispute, decideDispute } from "@/server/disputes/service";
import { orderHeldBalance, trialBalance, accountBalance, ACCOUNTS } from "@/server/ledger/ledger";
import { requestPayout, approvePayout } from "@/server/settlement/payouts";
import { submitCostAdjustment, reviewCostAdjustment, buyerDecideCost } from "@/server/logistics/costs";
import { handlePaymentWebhook } from "@/server/payments/service";
import { simulateIncomingTransfer } from "@/server/payments/sandbox";

describe("settlement plan", () => {
  it("allocates exactly the upfront amount, deducting dealer commission from dealer proceeds", () => {
    const lines = [
      { category: "VEHICLE", amount: new D("15000000"), beneficiary: "DEALER" as const, payableStage: "UPFRONT" },
      { category: "FREIGHT", amount: new D("1800000"), beneficiary: "SHIPPING_PROVIDER" as const, payableStage: "UPFRONT" },
      { category: "CUSTOMS_DUTY", amount: new D("3405000.55"), beneficiary: "GOVERNMENT" as const, payableStage: "UPFRONT" },
      { category: "PLATFORM_FEE", amount: new D("450000"), beneficiary: "PLATFORM" as const, payableStage: "UPFRONT" },
      { category: "CONTINGENCY", amount: new D("600000"), beneficiary: "CONTINGENCY_RESERVE" as const, payableStage: "ON_ARRIVAL" },
    ];
    const plan = buildSettlementPlan({ path: "PURCHASED_STOCK", lines, dealerOrgId: "org1", vehicleReleaseOnPurchasePercent: 70, dealerCommission: { percent: new D(5), fixed: new D(0) } });
    expect(sum(plan.map((p) => p.amount)).toFixed(2)).toBe("20655000.55");
    const commission = plan.find((p) => p.description === "Dealer commission")!;
    expect(commission.amount.toFixed(2)).toBe("750000.00");
    expect(commission.beneficiary).toBe("PLATFORM");
    const dealerTotal = sum(plan.filter((p) => p.beneficiary === "DEALER").map((p) => p.amount));
    expect(dealerTotal.toFixed(2)).toBe("14250000.00");
    expect(plan.find((p) => p.milestone === "PURCHASE_VERIFIED" && p.beneficiary === "DEALER")!.amount.toFixed(2)).toBe("9975000.00");
  });

  it("remaps milestones that do not exist on a path (local stock settles only after acceptance)", () => {
    const plan = buildSettlementPlan({ path: "LOCAL_STOCK", lines: [{ category: "VEHICLE", amount: new D(100), beneficiary: "SELLER", payableStage: "UPFRONT" }, { category: "FREIGHT", amount: new D(10), beneficiary: "SHIPPING_PROVIDER", payableStage: "UPFRONT" }], dealerOrgId: null, vehicleReleaseOnPurchasePercent: 70 });
    expect(new Set(plan.map((p) => p.milestone))).toEqual(new Set(["BUYER_ACCEPTED"]));
  });
});

describe("settlement, refunds and disputes", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPricing();
  });

  it("instructions sum to the amount paid and only become eligible after verified milestones", async () => {
    const { order } = await createPaidOrder({ dealer: true });
    const ins = await prisma.settlementInstruction.findMany({ where: { orderId: order.id } });
    expect(sum(ins.map((i) => i.amount)).equals(order.payableNow)).toBe(true);
    expect(ins.every((i) => i.status === "SCHEDULED")).toBe(true);
    const ops = await makeUser(["OPERATIONS"]);
    const doc = await uploadOrderDoc(ops, order.id, "inspection");
    await transitionOrder(ops, order.id, { to: "INSPECTION_COMPLETED", evidenceDocumentIds: [doc.id] });
    const eligible = await prisma.settlementInstruction.findMany({ where: { orderId: order.id, status: "ELIGIBLE" } });
    expect(eligible.length).toBeGreaterThan(0);
    expect(eligible.every((e) => e.milestone === "PURCHASE_VERIFIED")).toBe(true);
  });

  it("requires maker-checker approval and blocks dealers and buyers from releasing funds", async () => {
    const { order, dealer, buyer } = await createPaidOrder({ dealer: true });
    const ops = await makeUser(["OPERATIONS"]);
    const doc = await uploadOrderDoc(ops, order.id, "inspection");
    await transitionOrder(ops, order.id, { to: "INSPECTION_COMPLETED", evidenceDocumentIds: [doc.id] });
    const ins = await prisma.settlementInstruction.findFirstOrThrow({ where: { orderId: order.id, status: "ELIGIBLE", beneficiary: "DEALER" } });
    await expect(requestRelease(dealer!.actor, ins.id)).rejects.toThrow(/permission/);
    await expect(requestRelease(buyer, ins.id)).rejects.toThrow(/permission/);
    const f1 = await makeUser(["FINANCE"]);
    const f2 = await makeUser(["FINANCE"]);
    await requestRelease(f1, ins.id);
    await expect(approveRelease(f1, ins.id)).rejects.toThrow(/Dual control/);
    const released = await approveRelease(f2, ins.id);
    expect(released.status).toBe("RELEASED");
    expect((await accountBalance(prisma, ACCOUNTS.dealerPayable(dealer!.org.id, "NGN").code)).equals(ins.amount)).toBe(true);
    expect((await orderHeldBalance(prisma, order.id, "NGN")).equals(order.payableNow.minus(ins.amount))).toBe(true);
    // Dealer can then request a payout of the released balance; a different reviewer must approve.
    const p = await requestPayout(dealer!.actor, dealer!.org.id, ins.amount.toFixed(2));
    await expect(requestPayout(dealer!.actor, dealer!.org.id, "1.00")).rejects.toThrow(/exceeds/);
    await approvePayout(f2, p.id);
    expect((await accountBalance(prisma, ACCOUNTS.dealerPayable(dealer!.org.id, "NGN").code)).isZero()).toBe(true);
    for (const row of await trialBalance()) expect(row.balanced).toBe(true);
  });

  it("freezes eligible unreleased funds while a dispute is open and resumes after the decision", async () => {
    const { order, buyer } = await createPaidOrder({ dealer: true });
    const ops = await makeUser(["OPERATIONS"]);
    const doc = await uploadOrderDoc(ops, order.id, "inspection");
    await transitionOrder(ops, order.id, { to: "INSPECTION_COMPLETED", evidenceDocumentIds: [doc.id] });
    const f1 = await makeUser(["FINANCE"]);
    const f2 = await makeUser(["FINANCE"]);
    const ins = await prisma.settlementInstruction.findFirstOrThrow({ where: { orderId: order.id, status: "ELIGIBLE" } });
    await requestRelease(f1, ins.id);
    const dispute = await raiseDispute(buyer, { orderId: order.id, category: "INCORRECT_VEHICLE_OR_VIN", description: "The VIN on the inspection report does not match the listing." });
    expect((await prisma.settlementInstruction.findUniqueOrThrow({ where: { id: ins.id } })).status).toBe("BLOCKED_BY_DISPUTE");
    expect((await prisma.escrowReference.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe("FROZEN");
    await expect(approveRelease(f2, ins.id)).rejects.toThrow(/not awaiting approval/);
    await expect(transitionOrder(ops, order.id, { to: "EXPORT_PREPARATION" })).resolves.toBeTruthy(); // logistics can continue
    const admin = await makeUser(["SUPER_ADMIN"]);
    await decideDispute(admin, dispute.id, { outcome: "RELEASE_TO_SELLER", notes: "VIN matched after checking the auction sheet; typo in report." });
    expect((await prisma.settlementInstruction.findUniqueOrThrow({ where: { id: ins.id } })).status).toBe("ELIGIBLE");
    expect((await prisma.escrowReference.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe("SANDBOX_SIMULATED");
  });

  it("dispute refunds require finance dual control and cannot exceed unreleased funds", async () => {
    const { order, buyer } = await createPaidOrder();
    const dispute = await raiseDispute(buyer, { orderId: order.id, category: "VEHICLE_NOT_PURCHASED", description: "Seller says the vehicle was sold to someone else already." });
    const admin = await makeUser(["SUPER_ADMIN"]);
    await expect(decideDispute(admin, dispute.id, { outcome: "PARTIAL_REFUND", notes: "Refund more than what is held — must fail clearly.", refundAmount: order.payableNow.plus(1).toFixed(2) })).rejects.toThrow(/exceeds/);
    await decideDispute(admin, dispute.id, { outcome: "FULL_REFUND", notes: "Vehicle unavailable; full refund of unreleased funds." });
    const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: order.id } });
    expect(refund.status).toBe("REQUESTED");
    await expect(approveRefund(admin, refund.id)).rejects.toThrow(/Dual control/);
    const fin = await makeUser(["FINANCE"]);
    const done = await approveRefund(fin, refund.id);
    expect(done.status).toBe("COMPLETED");
    expect((await orderHeldBalance(prisma, order.id, "NGN")).isZero()).toBe(true);
    for (const row of await trialBalance()) expect(row.balanced).toBe(true);
  });

  it("cancellation after payment ends in REFUNDED once refunds complete", async () => {
    const { order } = await createPaidOrder();
    const ops = await makeUser(["OPERATIONS"]);
    await expect(transitionOrder(ops, order.id, { to: "CANCELLED" })).rejects.toThrow(/reason/);
    await transitionOrder(ops, order.id, { to: "CANCELLED", description: "Seller withdrew the vehicle" });
    const sup = await makeUser(["SUPPORT"]);
    const fin = await makeUser(["FINANCE"]);
    await expect(requestRefund(sup, { orderId: order.id, amount: order.payableNow.plus("0.01").toFixed(2), reason: "Seller withdrew" })).rejects.toThrow(/exceeds/);
    const r = await requestRefund(sup, { orderId: order.id, amount: order.payableNow.toFixed(2), reason: "Seller withdrew" });
    await approveRefund(fin, r.id);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).state).toBe("REFUNDED");
  });

  it("additional costs need evidence, internal review and buyer approval before being collected", async () => {
    const { order, buyer } = await createPaidOrder();
    const clearing = await makeUser(["CLEARING_PARTNER"]);
    const ops = await makeUser(["OPERATIONS"]);
    const ev = await uploadOrderDoc(ops, order.id, "demurrage-invoice");
    await expect(submitCostAdjustment(clearing, { orderId: order.id, code: "DEMURRAGE", label: "Terminal storage", amount: "150000", reason: "Vessel discharge delay", beneficiary: "PORT_TERMINAL", evidenceDocumentId: ev.id })).rejects.toThrow(/not found/i);
    const ca = await submitCostAdjustment(ops, { orderId: order.id, code: "DEMURRAGE", label: "Terminal storage", amount: "150000", reason: "Terminal storage beyond free days due to vessel delay", beneficiary: "PORT_TERMINAL", evidenceDocumentId: ev.id });
    await expect(submitCostAdjustment(ops, { orderId: order.id, code: "LOCAL_DELIVERY", label: "Delivery again", amount: "1000", reason: "Trying to double charge delivery", beneficiary: "LOCAL_TRANSPORTER", evidenceDocumentId: ev.id })).rejects.toThrow(/fixed amount/);
    await expect(reviewCostAdjustment(ops, ca.id, "SEND_TO_BUYER")).rejects.toThrow(/differ/);
    const ops2 = await makeUser(["OPERATIONS"]);
    await reviewCostAdjustment(ops2, ca.id, "SEND_TO_BUYER");
    expect(await prisma.paymentIntent.count({ where: { orderId: order.id, purpose: "ADDITIONAL_COST" } })).toBe(0);
    await buyerDecideCost(buyer, ca.id, true);
    const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { orderId: order.id, purpose: "ADDITIONAL_COST" } });
    const sim = await simulateIncomingTransfer(intent.reference, intent.amount);
    await handlePaymentWebhook("SANDBOX", sim.rawBody, sim.headers);
    expect((await prisma.costAdjustment.findUniqueOrThrow({ where: { id: ca.id } })).status).toBe("PAID");
    expect(await prisma.settlementInstruction.count({ where: { orderId: order.id, description: { contains: "Terminal storage" } } })).toBe(1);
  });
});
