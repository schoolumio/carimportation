import { brand } from "@/config/brand";
import { Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Terms and conditions" };

export default function Terms() {
  return (
    <div className="container-page max-w-3xl py-10">
      <PageHeader title="Terms and conditions" subtitle="Draft — version 2026-10-pilot-v1" />
      <Notice tone="warning" title="Draft for legal review">These terms are a structural draft prepared for the product. They must be reviewed and finalised by a qualified Nigerian legal practitioner before accepting real customers or funds.</Notice>
      <div className="prose-legal">
        <h2>1. Who we are</h2><p>{brand.name} ({brand.legalEntity}) operates an online marketplace and coordination service for purchasing and importing vehicles. We are not a bank, licensed escrow provider, shipping line or licensed customs agent. Regulated services are provided by authorised third parties identified in your order.</p>
        <h2>2. Listings</h2><p>Sellers are responsible for the accuracy of information they declare. Information independently substantiated with evidence is labelled as verified; everything else is labelled as seller-declared or an estimate. We do not guarantee seller-declared information.</p>
        <h2>3. Quotes</h2><p>Quotes are itemised and expire on the date shown. Only fixed-price quotes fix the total for the included items. Estimated and sourcing quotes are not guaranteed totals. Exclusions and assumptions form part of the quote.</p>
        <h2>4. Orders and contracts</h2><p>Accepting a quote creates an order and a contract record containing the agreed scope, settlement schedule, inspection period and cancellation terms. The record is stored with a cryptographic hash and cannot be altered.</p>
        <h2>5. Payments</h2><p>Payments must be made using the instructions and unique reference in your account. Payment is confirmed only from verified provider or bank records. Funds are held and released according to the settlement schedule and the arrangement with the authorised partner.</p>
        <h2>6. Additional charges</h2><p>Charges not included in your quote require your prior approval, except where a clause disclosed before payment provides otherwise. Every additional charge must be supported by evidence.</p>
        <h2>7. Delivery estimates</h2><p>Delivery dates are estimates. We will provide evidence-based updates, but delays caused by carriers, ports, customs or third parties are outside our control.</p>
        <h2>8. Inspection and acceptance</h2><p>You may inspect the vehicle during the inspection period stated in your contract. If you do not report a documented discrepancy within the period, the vehicle is deemed accepted.</p>
        <h2>9. Disputes</h2><p>Disputes follow the published dispute policy: evidence collection, response deadlines, investigation and a documented decision by authorised staff.</p>
        <h2>10. Liability</h2><p>[To be finalised with counsel, including consumer-protection obligations under the Federal Competition and Consumer Protection Act 2018.]</p>
        <h2>11. Governing law</h2><p>These terms are governed by the laws of the Federal Republic of Nigeria.</p>
      </div>
    </div>
  );
}
