import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { AccessGate } from "@/components/access-gate";

export const metadata: Metadata = {
  title: "Cardoso Finance · Wealth OS",
  description: "Gestão patrimonial pessoal, familiar e empresarial.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AccessGate><AppShell>{children}</AppShell></AccessGate>;
}
