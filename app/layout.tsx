import type { Metadata } from "next";
import { headers } from "next/headers";
import { DM_Serif_Display, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const display = DM_Serif_Display({ variable: "--font-display", subsets: ["latin"], weight: "400" });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "RightMark Intelligence | Understand rights. Underwrite value.";
  const description = "AI-assisted commercial-right intelligence with live public registries, explainable financial models, regulatory shock analysis, underwriting, and portfolio monitoring.";
  return {
    title, description, metadataBase: new URL(origin),
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title, description, type: "website", images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: "RightMark Intelligence commercial-right underwriting platform" }] },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${display.variable}`}>{children}</body>
    </html>
  );
}
