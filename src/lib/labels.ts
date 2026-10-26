// Human-readable labels for internal enum values (never show raw enums to customers).
export const NATURE_LABEL: Record<string, { label: string; tone: "verified" | "brand" | "pending" | "danger"; help: string }> = {
  FIXED: { label: "Fixed", tone: "verified", help: "Will not change for this order" },
  QUOTED: { label: "Quoted", tone: "brand", help: "Supplier or partner quote; may change if their price changes" },
  ESTIMATED: { label: "Estimate", tone: "pending", help: "Our best estimate from current operational data" },
  VARIABLE: { label: "Variable", tone: "danger", help: "Set by government or third parties at the time; may differ" },
};

export const BENEFICIARY_LABEL: Record<string, string> = {
  SELLER: "Seller", DEALER: "Dealer", PLATFORM: "Platform", AUCTION_HOUSE: "Auction house", SHIPPING_PROVIDER: "Shipping provider", INSURER: "Insurer",
  PORT_TERMINAL: "Port / terminal", GOVERNMENT: "Government (duties & taxes)", CLEARING_AGENT: "Clearing agent", LOCAL_TRANSPORTER: "Local transporter",
  PAYMENT_PROCESSOR: "Payment processor", CONTINGENCY_RESERVE: "Only if needed",
};

export const STAGE_LABEL: Record<string, string> = { UPFRONT: "Now", ON_ARRIVAL: "On arrival (if needed)", ON_DELIVERY: "On delivery" };

export const QUOTE_TYPE_LABEL: Record<string, { label: string; help: string }> = {
  FIXED_PRICE: { label: "Fixed-price quote", help: "All included costs are fixed for this order." },
  ESTIMATED_LANDED_COST: { label: "Estimated landed-cost quote", help: "Includes variable government, shipping, currency or third-party charges. Not a guaranteed total." },
  SOURCING: { label: "Sourcing quote", help: "The vehicle has not yet been purchased; the final acquisition cost is not yet known." },
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  CREATED: "Created", PENDING: "Awaiting payment", SUCCEEDED: "Received & verified", PARTIALLY_PAID: "Partially received", FAILED: "Failed", EXPIRED: "Expired", REVERSED: "Reversed by provider", DISPUTED: "Under review",
};

export const SETTLEMENT_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Held — milestone not reached", ELIGIBLE: "Eligible — awaiting finance", APPROVAL_REQUESTED: "Awaiting second approval", RELEASED: "Released", BLOCKED_BY_DISPUTE: "Frozen — dispute open", CANCELLED: "Cancelled",
};

export const DISPUTE_STATUS_LABEL: Record<string, string> = {
  OPEN: "Open", AWAITING_RESPONSE: "Awaiting seller response", UNDER_INVESTIGATION: "Under investigation", DECISION_ISSUED: "Decision issued", CLOSED: "Closed", WITHDRAWN: "Withdrawn",
};

export const PROVENANCE_LABEL: Record<string, { label: string; tone: "verified" | "brand" | "pending" | "neutral" }> = {
  PLATFORM_VERIFIED: { label: "Verified by platform", tone: "verified" },
  INDEPENDENT_REPORT: { label: "Independent report", tone: "verified" },
  DEALER_DECLARED: { label: "Seller-declared", tone: "neutral" },
  ESTIMATE: { label: "Estimate", tone: "pending" },
};

export const COUNTRY_NAME: Record<string, string> = { US: "United States", CA: "Canada", BE: "Belgium", DE: "Germany", AE: "UAE", KR: "South Korea", NL: "Netherlands", NG: "Nigeria", GB: "United Kingdom", CN: "China" };

export function human(s: string) {
  return s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
