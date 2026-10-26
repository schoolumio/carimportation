import type { Metadata } from "next";
import "./globals.css";
import { brand } from "@/config/brand";
import { EnvironmentBanner, Footer, Header } from "@/components/Shell";

export const metadata: Metadata = {
  title: { default: `${brand.name} — Import your car to Lagos with protected payments`, template: `%s · ${brand.name}` },
  description: brand.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG">
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">Skip to content</a>
        <EnvironmentBanner />
        <Header />
        <main id="main" className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
