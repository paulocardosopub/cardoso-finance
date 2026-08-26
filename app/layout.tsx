import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { PortfolioProvider } from "@/components/portfolio-provider";

export const metadata: Metadata = {
  title: "Cardoso Finance · Wealth OS",
  description: "Gestão patrimonial pessoal, familiar e empresarial.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#080b12",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><AuthGuard><PortfolioProvider><AppShell>{children}</AppShell></PortfolioProvider></AuthGuard></body></html>;
}
