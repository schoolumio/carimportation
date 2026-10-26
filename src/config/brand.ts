// Brand configuration. Change via environment variables — no application logic depends on these values.
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "AutoVault",
  tagline:
    process.env.NEXT_PUBLIC_BRAND_TAGLINE ??
    "Your car, from overseas to Lagos. Transparent pricing. Protected payments. Tracked delivery.",
  legalEntity: process.env.NEXT_PUBLIC_BRAND_LEGAL_ENTITY ?? "AutoVault (operating entity to be confirmed)",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com",
  supportPhone: process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? "+234 000 000 0000",
  primaryCity: process.env.NEXT_PUBLIC_PRIMARY_CITY ?? "Lagos",
  country: "Nigeria",
};
