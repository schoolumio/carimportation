import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

export function code(length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export const newOrderNumber = () => `AV-${new Date().getUTCFullYear()}-${code(6)}`;
export const newQuoteNumber = () => `Q-${code(8)}`;
export const newListingRef = () => `L-${code(7)}`;
export const newPaymentReference = () => `PAY-${code(10)}`;
export const newDisputeRef = () => `DSP-${code(7)}`;
export const newShipmentRef = () => `SHP-${code(8)}`;
export const newSourcingRef = () => `SRC-${code(7)}`;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}
