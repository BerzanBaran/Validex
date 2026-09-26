import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./styles.css";

export const metadata: Metadata = {
  title: "Validex — Şehrindeki fırsatı keşfet",
  description: "Yerel işletmelerden güvenli ve tek kullanımlık dijital kuponlar.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}

