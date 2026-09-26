"use client";

import Link from "next/link";

import { WalletButton } from "./WalletButton";

type DashboardHeaderProps = {
  role: "customer" | "merchant";
  onAddressChange: (address: string | null) => void;
};

export function DashboardHeader({ role, onAddressChange }: DashboardHeaderProps) {
  return (
    <header className="dashboardHeader">
      <div className="dashboardShell dashboardNav">
        <Link className="brand" href="/">validex<span>.</span></Link>
        <nav className="roleSwitch" aria-label="Panel seçimi">
          <Link className={role === "customer" ? "active" : ""} href="/musteri">Müşteri</Link>
          <Link className={role === "merchant" ? "active" : ""} href="/isletme">İşletme</Link>
        </nav>
        <WalletButton onAddressChange={onAddressChange} />
      </div>
    </header>
  );
}

