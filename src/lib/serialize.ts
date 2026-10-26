import type { Quote, QuoteLineItem } from "@prisma/client";
import type { LandedCostResult } from "@/server/pricing/calculator";
import type { BreakdownData } from "@/components/CostBreakdown";

export function breakdownFromResult(r: LandedCostResult, extra: { etaMinDays?: number; etaMaxDays?: number } = {}): BreakdownData {
  return {
    quoteType: r.quoteType, total: r.total.toFixed(2), low: r.low.toFixed(2), high: r.high.toFixed(2), payableNow: r.payableNow.toFixed(2), payableLater: r.payableLater.toFixed(2),
    subtotals: { vehicle: r.subtotals.vehicle.toFixed(2), logistics: r.subtotals.logistics.toFixed(2), taxes: r.subtotals.taxes.toFixed(2), fees: r.subtotals.fees.toFixed(2), contingency: r.subtotals.contingency.toFixed(2) },
    assumptions: r.assumptions, exclusions: r.exclusions, usesUnverifiedRules: r.usesUnverifiedRules, ...extra,
    lines: r.lines.map((l) => ({ code: l.code, label: l.label, category: l.category, amount: l.amount.toFixed(2), lowAmount: l.lowAmount.toFixed(2), highAmount: l.highAmount.toFixed(2), originalAmount: l.originalAmount?.toFixed(2) ?? null, originalCurrency: l.originalCurrency, nature: l.nature, calculation: l.calculation, ruleVerified: l.ruleVerified, payableStage: l.payableStage, refundable: l.refundable, beneficiary: l.beneficiary })),
  };
}

export function breakdownFromQuote(q: Quote & { lineItems: QuoteLineItem[] }, paidStages: string[] = []): BreakdownData {
  return {
    quoteType: q.type, total: q.totalEstimate.toFixed(2), low: q.lowEstimate.toFixed(2), high: q.highEstimate.toFixed(2), payableNow: q.payableNow.toFixed(2), payableLater: q.payableLater.toFixed(2),
    subtotals: { vehicle: q.vehicleSubtotal.toFixed(2), logistics: q.logisticsSubtotal.toFixed(2), taxes: q.taxesSubtotal.toFixed(2), fees: q.feesSubtotal.toFixed(2), contingency: q.contingency.toFixed(2) },
    assumptions: q.assumptions, exclusions: q.exclusions, usesUnverifiedRules: q.usesUnverifiedRules, validUntil: q.status === "ISSUED" ? q.validUntil : null, etaMinDays: q.etaMinDays, etaMaxDays: q.etaMaxDays,
    lines: q.lineItems.map((l) => ({ code: l.code, label: l.label, category: l.category, amount: l.amount.toFixed(2), lowAmount: l.lowAmount.toFixed(2), highAmount: l.highAmount.toFixed(2), originalAmount: l.originalAmount?.toFixed(2) ?? null, originalCurrency: l.originalCurrency, nature: l.nature, calculation: l.calculation, ruleVerified: l.ruleVerified, payableStage: l.payableStage, refundable: l.refundable, beneficiary: l.beneficiary, paid: paidStages.includes(l.payableStage) })),
  };
}
