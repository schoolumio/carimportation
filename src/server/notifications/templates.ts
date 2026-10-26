// Default notification templates. Administrators can override per channel in NotificationTemplate.
// Placeholders: {{name}}. Missing variables render as empty strings.
export const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  "auth.password_reset": { subject: "Reset your password", body: "Use this link within 30 minutes to reset your password: {{link}}. If you did not request this, ignore this message." },
  "quote.issued": { subject: "Your quote {{quoteNumber}} is ready", body: "Estimated landed cost: {{total}}. Valid until {{validUntil}}." },
  "order.created": { subject: "Order {{orderNumber}} created", body: "We have recorded your order and the agreed contract terms. Next step: {{nextStep}}" },
  "order.compliance_required": { subject: "Verification needed for {{orderNumber}}", body: "Please complete identity verification so we can issue payment instructions." },
  "order.payment_instructions": { subject: "Payment instructions for {{orderNumber}}", body: "Pay {{amount}} using reference {{reference}}. Only pay to the account shown in your dashboard." },
  "payment.confirmed": { subject: "Payment confirmed for {{orderNumber}}", body: "We have confirmed receipt of {{amount}} from a verified payment record." },
  "payment.partial": { subject: "Partial payment received for {{orderNumber}}", body: "We received {{received}} of {{expected}}. The balance is still outstanding." },
  "order.milestone": { subject: "{{orderNumber}}: {{milestone}}", body: "{{description}}" },
  "order.eta_changed": { subject: "Updated arrival estimate for {{orderNumber}}", body: "New estimate: {{eta}}. Reason: {{reason}}" },
  "cost.approval_required": { subject: "Additional charge needs your approval ({{orderNumber}})", body: "{{label}}: {{amount}}. Reason: {{reason}}. Review it in your dashboard before it is charged." },
  "cost.contractual_exception": { subject: "Contractual charge recorded ({{orderNumber}})", body: "{{label}}: {{amount}} under clause: {{clause}}." },
  "delivery.scheduled": { subject: "Delivery scheduled for {{orderNumber}}", body: "Scheduled for {{when}} at {{address}}." },
  "delivery.confirmed": { subject: "Delivered: {{orderNumber}}", body: "Your inspection period ends {{deadline}}. Accept the vehicle or report a discrepancy before then." },
  "dispute.opened": { subject: "Dispute {{reference}} opened", body: "A dispute was raised on order {{orderNumber}}: {{category}}. Eligible unreleased funds are on hold." },
  "dispute.decision": { subject: "Decision on dispute {{reference}}", body: "Outcome: {{outcome}}. {{notes}}" },
  "refund.update": { subject: "Refund update for {{orderNumber}}", body: "Refund of {{amount}} is now {{status}}." },
  "settlement.update": { subject: "Settlement update ({{orderNumber}})", body: "{{description}}: {{amount}} — {{status}}." },
  "dealer.status": { subject: "Dealer application: {{status}}", body: "{{notes}}" },
  "listing.status": { subject: "Listing {{ref}}: {{status}}", body: "{{notes}}" },
  "sourcing.offer": { subject: "New sourcing offer for {{reference}}", body: "A sourcing offer is available: {{vehicle}}." },
  "support.reply": { subject: "Reply on: {{subject}}", body: "{{body}}" },
  "inquiry.new": { subject: "New inquiry on {{listing}}", body: "{{message}}" },
  "inquiry.reply": { subject: "Reply to your inquiry on {{listing}}", body: "{{message}}" },
};

export function render(tpl: string, vars: Record<string, string | number | null | undefined>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k] ?? ""));
}
