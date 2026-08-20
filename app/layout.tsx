import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { PortfolioProvider } from "@/components/portfolio-provider";

export const metadata: Metadata = {
  title: "Cardoso Finance · Wealth OS",
  description: "Gestão patrimonial pessoal, familiar e empresarial.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AuthGuard><PortfolioProvider><AppShell>{children}</AppShell></PortfolioProvider></AuthGuard>;
}
