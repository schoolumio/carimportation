// Source of truth for role → permission defaults. Seeded into Role/Permission tables;
// authorization reads the database so super administrators can adjust non-protected grants.

export const PERMISSIONS = {
  "listing.manage.own": "Create and edit listings for own dealer organisation",
  "listing.manage.all": "Create and edit any listing including platform-owned inventory",
  "listing.moderate": "Approve, reject or suspend listings; record verified facts",
  "dealer.verify": "Review dealer applications and verification checks",
  "order.view.all": "View all orders",
  "order.transition.ops": "Operations milestones (authorise purchase, inspections, cancellations)",
  "order.transition.logistics": "Logistics milestones on assigned shipments",
  "order.transition.clearing": "Customs/clearing milestones on assigned shipments",
  "order.transition.delivery": "Delivery milestones on assigned shipments",
  "order.transition.dealer": "Dealer milestones on own-organisation orders",
  "shipment.manage": "Create shipments, assign partners, revise ETAs on any order",
  "payment.manual.record": "Record a pilot bank-statement credit (maker)",
  "payment.manual.approve": "Approve a recorded pilot bank-statement credit (checker)",
  "refund.request": "Request a refund",
  "refund.approve": "Approve and execute refunds (checker)",
  "settlement.request": "Request release of eligible settlement",
  "settlement.approve": "Approve release of settlement (checker)",
  "payout.review": "Review dealer payout requests",
  "ledger.view": "View ledger, balances and reconciliation",
  "reconciliation.run": "Run provider reconciliation",
  "dispute.manage": "Investigate disputes and collect evidence",
  "dispute.decide": "Issue dispute decisions",
  "support.manage": "Manage support conversations",
  "pricing.manage": "Manage pricing rules and exchange-rate snapshots",
  "cost.submit": "Submit additional cost claims on assigned/own orders",
  "cost.review": "Review additional cost claims",
  "compliance.review": "Review buyer identity and order compliance checks",
  "document.review": "Review uploaded documents",
  "sourcing.offer": "Submit sourcing offers",
  "user.manage": "Manage users and role assignments",
  "config.manage": "Manage platform configuration, countries, locations, templates",
  "audit.view": "View the immutable audit log",
  "reports.view": "View platform analytics",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ROLES = {
  BUYER: { name: "Buyer", privileged: false, description: "Customer purchasing vehicles" },
  DEALER: { name: "Dealer", privileged: false, description: "Member of a dealer/supplier organisation" },
  LOGISTICS_OPERATOR: { name: "Overseas logistics operator", privileged: false, description: "Sourcing and export logistics" },
  CLEARING_PARTNER: { name: "Customs clearing partner", privileged: false, description: "Clearing agent for assigned shipments" },
  DELIVERY_PARTNER: { name: "Delivery partner", privileged: false, description: "Local transport and final delivery" },
  SUPPORT: { name: "Customer support", privileged: true, description: "Customer inquiries and coordination" },
  VERIFICATION: { name: "Verification officer", privileged: true, description: "Dealer, listing and identity verification" },
  OPERATIONS: { name: "Operations", privileged: true, description: "Order and logistics operations" },
  FINANCE: { name: "Finance & escrow operations", privileged: true, description: "Payments, reconciliation, settlements" },
  SUPER_ADMIN: { name: "Super administrator", privileged: true, description: "Full platform administration" },
} as const;

export type RoleKey = keyof typeof ROLES;

const ALL = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  BUYER: [],
  DEALER: ["listing.manage.own", "order.transition.dealer", "cost.submit", "sourcing.offer"],
  LOGISTICS_OPERATOR: ["order.transition.logistics", "cost.submit"],
  CLEARING_PARTNER: ["order.transition.clearing", "cost.submit"],
  DELIVERY_PARTNER: ["order.transition.delivery"],
  SUPPORT: ["order.view.all", "support.manage", "dispute.manage", "refund.request"],
  VERIFICATION: ["dealer.verify", "listing.moderate", "compliance.review", "document.review", "order.view.all"],
  OPERATIONS: [
    "order.view.all", "order.transition.ops", "order.transition.logistics", "order.transition.clearing",
    "order.transition.delivery", "shipment.manage", "listing.manage.all", "listing.moderate", "cost.review",
    "cost.submit", "document.review", "sourcing.offer", "dispute.manage", "support.manage", "reports.view",
  ],
  FINANCE: [
    "order.view.all", "payment.manual.record", "payment.manual.approve", "refund.request", "refund.approve",
    "settlement.request", "settlement.approve", "payout.review", "ledger.view", "reconciliation.run", "reports.view",
  ],
  // Super admin holds every permission. Dual-control is still enforced by "different user" rules.
  SUPER_ADMIN: ALL,
};

/** Permissions that may never be granted to non-privileged roles, even by a super administrator. */
export const PROTECTED_PERMISSIONS: Permission[] = [
  "payment.manual.record", "payment.manual.approve", "refund.approve", "settlement.approve",
  "settlement.request", "ledger.view", "reconciliation.run", "user.manage", "config.manage", "dispute.decide",
];

export const STAFF_ROLES: RoleKey[] = ["SUPPORT", "VERIFICATION", "OPERATIONS", "FINANCE", "SUPER_ADMIN"];
export const PARTNER_ROLES: RoleKey[] = ["LOGISTICS_OPERATOR", "CLEARING_PARTNER", "DELIVERY_PARTNER"];
