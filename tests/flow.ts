import { createQuoteForListing } from "@/server/quotes/service";
import { acceptQuote } from "@/server/orders/service";
import { handlePaymentWebhook } from "@/server/payments/service";
import { simulateIncomingTransfer } from "@/server/payments/sandbox";
import { makeDealer, makeListing, makeUser, prisma } from "./helpers";
import type { Actor } from "@/server/auth/actor";

export async function createOrder(opts: { dealer?: boolean; listingType?: string; availability?: string; buyer?: Actor } = {}) {
  const admin = await makeUser(["SUPER_ADMIN"]);
  const buyer = opts.buyer ?? (await makeUser(["BUYER"]));
  const dealer = opts.dealer ? await makeDealer() : null;
  const listing = await makeListing(dealer?.actor ?? admin, { dealerOrgId: dealer?.org.id ?? null, listingType: opts.listingType, availability: opts.availability });
  const quote = await createQuoteForListing(buyer, listing.id);
  const order = await acceptQuote(buyer, quote.id, { acceptTerms: true, deliveryAddress: "12 Admiralty Way, Lekki, Lagos" });
  return { admin, buyer, dealer, listing, quote, order };
}

export async function payOrder(orderId: string) {
  const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { orderId, purpose: "ORDER_PAYMENT" } });
  const sim = await simulateIncomingTransfer(intent.reference, intent.amount);
  const res = await handlePaymentWebhook("SANDBOX", sim.rawBody, sim.headers);
  return { intent, sim, res };
}

export async function createPaidOrder(opts: Parameters<typeof createOrder>[0] = {}) {
  const ctx = await createOrder(opts);
  const pay = await payOrder(ctx.order.id);
  return { ...ctx, ...pay };
}
