"use server";
import { redirect } from "next/navigation";
import { requireActor, requestContext } from "@/server/web/session";
import { acceptQuote } from "@/server/orders/service";
import { errorMessage, str } from "@/server/web/actions";

export async function acceptQuoteAction(fd: FormData) {
  const quoteId = str(fd, "quoteId");
  const actor = await requireActor(`/checkout/${quoteId}`);
  const ctx = await requestContext();
  let orderId = "";
  try {
    if (str(fd, "address").trim().length < 8) throw new Error("Enter the delivery address in Lagos.");
    const order = await acceptQuote(actor, quoteId, { acceptTerms: str(fd, "accept") === "on", ip: ctx.ip, userAgent: ctx.userAgent, deliveryAddress: `${str(fd, "address").trim()} (${str(fd, "location")})` });
    orderId = order.id;
  } catch (e) {
    redirect(`/checkout/${quoteId}?error=${encodeURIComponent(e instanceof Error && e.message.startsWith("Enter") ? e.message : errorMessage(e))}`);
  }
  redirect(`/account/orders/${orderId}?ok=${encodeURIComponent("Order created. Follow the next step below.")}`);
}
