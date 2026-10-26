// Explicit, auditable order state machine (pure definitions).
// Every transition declares: allowed source states, who may perform it, paths it applies to,
// whether evidence is required, and how the buyer is notified.
import type { OrderPath, OrderState } from "@prisma/client";
import type { Permission } from "@/server/auth/permissions";

/** "SYSTEM" transitions can only be performed by internal services reacting to verified records (e.g. payment webhooks). */
export type Performer = Permission | "SYSTEM" | "BUYER_OWNER";

export interface TransitionDef {
  to: OrderState;
  from: OrderState[];
  performers: Performer[];
  paths?: OrderPath[];
  evidenceRequired?: boolean;
  /** Short human-readable description used in timelines and notifications. */
  label: string;
  notifyBuyer: boolean;
  /** Blocked while a dispute that freezes funds is open. */
  blockedByOpenDispute?: boolean;
}

const SOURCING_PATHS: OrderPath[] = ["SOURCE_AND_IMPORT", "AUCTION_PURCHASE"];
const OVERSEAS_PATHS: OrderPath[] = ["SOURCE_AND_IMPORT", "AUCTION_PURCHASE", "PURCHASED_STOCK"];

export const TRANSITIONS: TransitionDef[] = [
  { to: "COMPLIANCE_CHECK", from: ["ORDER_CREATED"], performers: ["SYSTEM"], label: "Identity and compliance checks required", notifyBuyer: true },
  { to: "AWAITING_PAYMENT", from: ["ORDER_CREATED", "COMPLIANCE_CHECK"], performers: ["SYSTEM", "compliance.review"], label: "Payment instructions issued", notifyBuyer: true },
  { to: "FUNDS_CONFIRMED", from: ["AWAITING_PAYMENT"], performers: ["SYSTEM"], label: "Funds confirmed from a verified payment record", notifyBuyer: true },
  { to: "FUNDS_PROTECTED", from: ["FUNDS_CONFIRMED"], performers: ["SYSTEM"], label: "Funds recorded against the protected-funds arrangement", notifyBuyer: true },

  { to: "PURCHASE_AUTHORIZED", from: ["FUNDS_PROTECTED"], performers: ["order.transition.ops"], paths: SOURCING_PATHS, label: "Vehicle purchase authorised", notifyBuyer: true, blockedByOpenDispute: true },
  { to: "PURCHASE_COMPLETED", from: ["PURCHASE_AUTHORIZED"], performers: ["order.transition.ops", "order.transition.logistics", "order.transition.dealer"], paths: SOURCING_PATHS, evidenceRequired: true, label: "Vehicle purchased — invoice uploaded", notifyBuyer: true },
  { to: "PURCHASE_FAILED", from: ["PURCHASE_AUTHORIZED"], performers: ["order.transition.ops", "order.transition.logistics"], paths: SOURCING_PATHS, label: "Purchase could not be completed", notifyBuyer: true },

  { to: "INSPECTION_COMPLETED", from: ["PURCHASE_COMPLETED"], performers: ["order.transition.ops"], paths: SOURCING_PATHS, evidenceRequired: true, label: "Inspection report reviewed", notifyBuyer: true },
  { to: "INSPECTION_COMPLETED", from: ["FUNDS_PROTECTED"], performers: ["order.transition.ops"], paths: ["PURCHASED_STOCK"], evidenceRequired: true, label: "Inspection report reviewed", notifyBuyer: true },
  { to: "INSPECTION_FAILED", from: ["PURCHASE_COMPLETED", "FUNDS_PROTECTED"], performers: ["order.transition.ops"], paths: OVERSEAS_PATHS, evidenceRequired: true, label: "Inspection found material issues", notifyBuyer: true },
  { to: "INSPECTION_COMPLETED", from: ["INSPECTION_FAILED"], performers: ["order.transition.ops"], paths: OVERSEAS_PATHS, evidenceRequired: true, label: "Buyer accepted inspection findings in writing", notifyBuyer: true },

  { to: "EXPORT_PREPARATION", from: ["INSPECTION_COMPLETED"], performers: ["order.transition.ops", "order.transition.logistics", "order.transition.dealer"], paths: OVERSEAS_PATHS, label: "Export preparation started", notifyBuyer: true },
  { to: "SHIPMENT_BOOKED", from: ["EXPORT_PREPARATION", "INSPECTION_COMPLETED"], performers: ["order.transition.ops", "order.transition.logistics", "order.transition.dealer"], paths: OVERSEAS_PATHS, evidenceRequired: true, label: "Shipment booked", notifyBuyer: true },
  { to: "DEPARTED", from: ["SHIPMENT_BOOKED"], performers: ["order.transition.ops", "order.transition.logistics"], paths: OVERSEAS_PATHS, evidenceRequired: true, label: "Vessel departed — bill of lading issued", notifyBuyer: true },
  { to: "IN_TRANSIT", from: ["DEPARTED"], performers: ["order.transition.ops", "order.transition.logistics", "SYSTEM"], paths: OVERSEAS_PATHS, label: "In transit to Lagos", notifyBuyer: true },
  { to: "IN_TRANSIT", from: ["FUNDS_PROTECTED"], performers: ["order.transition.ops", "order.transition.logistics"], paths: ["IN_TRANSIT_STOCK"], evidenceRequired: true, label: "Ownership transfer recorded; vehicle in transit", notifyBuyer: true },

  { to: "ARRIVED_NIGERIA", from: ["IN_TRANSIT", "DEPARTED"], performers: ["order.transition.ops", "order.transition.logistics", "order.transition.clearing"], paths: [...OVERSEAS_PATHS, "IN_TRANSIT_STOCK"], evidenceRequired: true, label: "Arrived at Nigerian port", notifyBuyer: true },
  { to: "CUSTOMS_CLEARANCE", from: ["ARRIVED_NIGERIA"], performers: ["order.transition.ops", "order.transition.clearing"], label: "Customs clearance in progress", notifyBuyer: true },
  { to: "RELEASED_FROM_PORT", from: ["CUSTOMS_CLEARANCE"], performers: ["order.transition.ops", "order.transition.clearing"], evidenceRequired: true, label: "Released from port", notifyBuyer: true },
  { to: "LOCAL_TRANSPORT", from: ["RELEASED_FROM_PORT"], performers: ["order.transition.ops", "order.transition.delivery"], label: "On the way to delivery address", notifyBuyer: true },
  { to: "LOCAL_TRANSPORT", from: ["FUNDS_PROTECTED"], performers: ["order.transition.ops", "order.transition.delivery"], paths: ["LOCAL_STOCK"], label: "On the way to delivery address", notifyBuyer: true },
  { to: "READY_FOR_HANDOVER", from: ["LOCAL_TRANSPORT", "RELEASED_FROM_PORT"], performers: ["order.transition.ops", "order.transition.delivery"], label: "Ready for handover and inspection", notifyBuyer: true },
  { to: "READY_FOR_HANDOVER", from: ["FUNDS_PROTECTED"], performers: ["order.transition.ops"], paths: ["LOCAL_STOCK"], label: "Ready for collection and inspection", notifyBuyer: true },
  { to: "DELIVERED", from: ["READY_FOR_HANDOVER"], performers: ["order.transition.ops", "order.transition.delivery"], evidenceRequired: true, label: "Delivered — handover evidence recorded", notifyBuyer: true },
  { to: "ACCEPTANCE_PERIOD", from: ["DELIVERED"], performers: ["SYSTEM"], label: "Inspection and acceptance period started", notifyBuyer: true },
  { to: "ACCEPTED", from: ["ACCEPTANCE_PERIOD"], performers: ["BUYER_OWNER", "SYSTEM"], label: "Vehicle accepted", notifyBuyer: true, blockedByOpenDispute: true },
  { to: "SETTLEMENT", from: ["ACCEPTED"], performers: ["SYSTEM"], label: "Final settlement in progress", notifyBuyer: false, blockedByOpenDispute: true },
  { to: "COMPLETED", from: ["SETTLEMENT"], performers: ["SYSTEM", "order.transition.ops"], label: "Order completed", notifyBuyer: true, blockedByOpenDispute: true },

  { to: "CANCELLED", from: ["ORDER_CREATED", "COMPLIANCE_CHECK", "AWAITING_PAYMENT"], performers: ["BUYER_OWNER", "order.transition.ops", "SYSTEM"], label: "Order cancelled before payment", notifyBuyer: true },
  { to: "CANCELLED", from: ["FUNDS_CONFIRMED", "FUNDS_PROTECTED", "PURCHASE_AUTHORIZED", "PURCHASE_FAILED", "INSPECTION_FAILED"], performers: ["order.transition.ops"], label: "Order cancelled — refund assessment required", notifyBuyer: true },
  { to: "REFUNDED", from: ["CANCELLED"], performers: ["SYSTEM"], label: "Refund completed", notifyBuyer: true },
];

export const TERMINAL_STATES: OrderState[] = ["COMPLETED", "REFUNDED"];

export function findTransition(path: OrderPath, from: OrderState, to: OrderState): TransitionDef | undefined {
  return TRANSITIONS.find((t) => t.to === to && t.from.includes(from) && (!t.paths || t.paths.includes(path)));
}

export function nextStates(path: OrderPath, from: OrderState): TransitionDef[] {
  return TRANSITIONS.filter((t) => t.from.includes(from) && (!t.paths || t.paths.includes(path)));
}

// Human-readable labels — never show raw enum values to customers.
export const STATE_LABEL: Record<OrderState, string> = {
  ORDER_CREATED: "Order created",
  COMPLIANCE_CHECK: "Verification required",
  AWAITING_PAYMENT: "Awaiting payment",
  FUNDS_CONFIRMED: "Payment confirmed",
  FUNDS_PROTECTED: "Funds protected",
  PURCHASE_AUTHORIZED: "Purchase authorised",
  PURCHASE_COMPLETED: "Vehicle purchased",
  INSPECTION_COMPLETED: "Inspection completed",
  EXPORT_PREPARATION: "Preparing for export",
  SHIPMENT_BOOKED: "Shipment booked",
  DEPARTED: "Departed origin port",
  IN_TRANSIT: "In transit",
  ARRIVED_NIGERIA: "Arrived in Nigeria",
  CUSTOMS_CLEARANCE: "Customs clearance",
  RELEASED_FROM_PORT: "Released from port",
  LOCAL_TRANSPORT: "Out for delivery",
  READY_FOR_HANDOVER: "Ready for handover",
  DELIVERED: "Delivered",
  ACCEPTANCE_PERIOD: "Inspection period",
  ACCEPTED: "Accepted by buyer",
  SETTLEMENT: "Final settlement",
  COMPLETED: "Completed",
  PURCHASE_FAILED: "Purchase unsuccessful",
  INSPECTION_FAILED: "Inspection issues found",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

/** Canonical customer-facing journey per path (used for the visual timeline). */
export const JOURNEY: Record<OrderPath, OrderState[]> = {
  SOURCE_AND_IMPORT: ["ORDER_CREATED", "AWAITING_PAYMENT", "FUNDS_PROTECTED", "PURCHASE_AUTHORIZED", "PURCHASE_COMPLETED", "INSPECTION_COMPLETED", "EXPORT_PREPARATION", "SHIPMENT_BOOKED", "DEPARTED", "IN_TRANSIT", "ARRIVED_NIGERIA", "CUSTOMS_CLEARANCE", "RELEASED_FROM_PORT", "LOCAL_TRANSPORT", "DELIVERED", "ACCEPTED", "COMPLETED"],
  AUCTION_PURCHASE: ["ORDER_CREATED", "AWAITING_PAYMENT", "FUNDS_PROTECTED", "PURCHASE_AUTHORIZED", "PURCHASE_COMPLETED", "INSPECTION_COMPLETED", "EXPORT_PREPARATION", "SHIPMENT_BOOKED", "DEPARTED", "IN_TRANSIT", "ARRIVED_NIGERIA", "CUSTOMS_CLEARANCE", "RELEASED_FROM_PORT", "LOCAL_TRANSPORT", "DELIVERED", "ACCEPTED", "COMPLETED"],
  PURCHASED_STOCK: ["ORDER_CREATED", "AWAITING_PAYMENT", "FUNDS_PROTECTED", "INSPECTION_COMPLETED", "EXPORT_PREPARATION", "SHIPMENT_BOOKED", "DEPARTED", "IN_TRANSIT", "ARRIVED_NIGERIA", "CUSTOMS_CLEARANCE", "RELEASED_FROM_PORT", "LOCAL_TRANSPORT", "DELIVERED", "ACCEPTED", "COMPLETED"],
  IN_TRANSIT_STOCK: ["ORDER_CREATED", "AWAITING_PAYMENT", "FUNDS_PROTECTED", "IN_TRANSIT", "ARRIVED_NIGERIA", "CUSTOMS_CLEARANCE", "RELEASED_FROM_PORT", "LOCAL_TRANSPORT", "DELIVERED", "ACCEPTED", "COMPLETED"],
  LOCAL_STOCK: ["ORDER_CREATED", "AWAITING_PAYMENT", "FUNDS_PROTECTED", "LOCAL_TRANSPORT", "READY_FOR_HANDOVER", "DELIVERED", "ACCEPTED", "COMPLETED"],
};

export function pathForListing(listingType: string, availability: string, isSourcingOffer = false): OrderPath {
  if (isSourcingOffer) return "SOURCE_AND_IMPORT";
  switch (listingType) {
    case "OVERSEAS_AUCTION":
      return "AUCTION_PURCHASE";
    case "OVERSEAS_SUPPLIER_STOCK":
      return "SOURCE_AND_IMPORT";
    case "PURCHASED_OVERSEAS":
      return "PURCHASED_STOCK";
    case "IN_TRANSIT":
      return "IN_TRANSIT_STOCK";
    case "IN_NIGERIA":
      return availability === "AVAILABLE_LOCAL_DELIVERY" ? "LOCAL_STOCK" : "IN_TRANSIT_STOCK";
    default:
      return "SOURCE_AND_IMPORT";
  }
}

/** Order states at which settlement milestones become eligible. */
export const MILESTONE_TRIGGERS: Record<string, OrderState[]> = {
  PURCHASE_VERIFIED: ["INSPECTION_COMPLETED"],
  VEHICLE_DEPARTED: ["DEPARTED"],
  ARRIVED_NIGERIA: ["ARRIVED_NIGERIA"],
  BUYER_ACCEPTED: ["ACCEPTED"],
};

export const PATH_LABEL: Record<OrderPath, string> = {
  SOURCE_AND_IMPORT: "Source & import",
  AUCTION_PURCHASE: "Auction purchase & import",
  PURCHASED_STOCK: "Already purchased overseas",
  IN_TRANSIT_STOCK: "Already shipped / at port",
  LOCAL_STOCK: "In Nigeria — local delivery",
};
