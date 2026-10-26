import { brand } from "@/config/brand";
import { Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Privacy policy" };

export default function Privacy() {
  return (
    <div className="container-page max-w-3xl py-10">
      <PageHeader title="Privacy policy" subtitle="Draft — subject to review under the Nigeria Data Protection Act 2023" />
      <Notice tone="warning" title="Draft for legal review">This policy must be reviewed by a qualified data-protection professional, including any registration or audit obligations with the Nigeria Data Protection Commission, before processing real customer data.</Notice>
      <div className="prose-legal">
        <h2>What we collect</h2><ul><li>Account details: name, email, phone.</li><li>Identity verification: document type, number (encrypted at rest) and document image, for compliance checks.</li><li>Dealer business information, including settlement bank details (encrypted at rest).</li><li>Order, payment, shipment and delivery records.</li><li>Security logs: sign-in events, IP address and device information.</li></ul>
        <h2>Why we use it</h2><ul><li>To provide quotes, orders, payments, tracking and delivery (contract).</li><li>To meet legal obligations such as anti-money-laundering and tax record keeping.</li><li>To prevent fraud and secure the platform (legitimate interests).</li></ul>
        <h2>Who we share it with</h2><p>Only with parties needed to fulfil your order: the payment/escrow partner, the seller or dealer (limited order details), logistics, clearing and delivery partners assigned to your shipment, and authorities where required by law. Partners see only records assigned to them.</p>
        <h2>Security</h2><p>Private documents are never publicly accessible; downloads use short-lived signed links checked against your permissions. Sensitive fields are encrypted. Staff access is role-based, logged in an append-only audit trail and protected by multi-factor authentication for privileged roles.</p>
        <h2>Retention</h2><p>Transaction, ledger and audit records are retained for the period required by financial and tax law [period to be confirmed]. Marketing data is deleted on request. See docs/OPERATIONS.md for the retention schedule.</p>
        <h2>Your rights</h2><p>You may request access, correction, deletion (subject to legal retention), restriction and portability. Contact {brand.supportEmail}.</p>
      </div>
    </div>
  );
}
