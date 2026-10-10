"use client";

import Link from "next/link";

import { WalletButton } from "./WalletButton";
import { ThemeToggle } from "./ThemeToggle";

type DashboardHeaderProps = {
  role: "customer" | "merchant";
  onAddressChange: (address: string | null) => void;
};

export function DashboardHeader({ role, onAddressChange }: DashboardHeaderProps) {
  return (
    <header className="dashboardHeader">
      <div className="dashboardShell dashboardNav">
        <Link className="brand" href="/">validex<span>.</span></Link>
        <nav className="roleSwitch" aria-label="Dashboard selection">
          <Link className={role === "customer" ? "active" : ""} href="/musteri">Customer</Link>
          <Link className={role === "merchant" ? "active" : ""} href="/isletme">Merchant</Link>
        </nav>
        <div className="dashboardActions"><ThemeToggle /><WalletButton onAddressChange={onAddressChange} /></div>
      </div>
    </header>
  );
}

