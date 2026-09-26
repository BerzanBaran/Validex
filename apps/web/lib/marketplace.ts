"use client";

import { useCallback, useEffect, useState } from "react";

export type Campaign = {
  id: string;
  ownerWallet: string;
  merchant: string;
  title: string;
  description: string;
  area: string;
  category: string;
  priceUsdc: number;
  originalValueUsdc: number;
  stock: number;
  sold: number;
  expiresAt: string;
  status: "published" | "paused";
  accent: "coffee" | "berry" | "lime" | "ocean";
};

export type Voucher = {
  id: string;
  campaignId: string;
  ownerWallet: string;
  merchant: string;
  title: string;
  priceUsdc: number;
  purchasedAt: string;
  expiresAt: string;
  code: string;
  status: "active" | "redeemed";
};

export type CampaignDraft = Omit<Campaign, "id" | "sold" | "status" | "accent">;

const CAMPAIGNS_KEY = "validex.demo.campaigns.v1";
const VOUCHERS_KEY = "validex.demo.vouchers.v1";

const DEFAULT_CAMPAIGNS: Campaign[] = [
  {
    id: "cmp_kavurucu_7",
    ownerWallet: "DemoMerchant11111111111111111111111111111",
    merchant: "Kavurucu No.7",
    title: "İki nitelikli kahve, tek fiyat",
    description: "Seçili iki nitelikli kahveyi tek fiyatla deneyin.",
    area: "Kadıköy",
    category: "Kahve",
    priceUsdc: 5,
    originalValueUsdc: 10,
    stock: 50,
    sold: 8,
    expiresAt: "2027-01-31",
    status: "published",
    accent: "coffee",
  },
  {
    id: "cmp_minoa_kitchen",
    ownerWallet: "DemoMerchant22222222222222222222222222222",
    merchant: "Minoa Kitchen",
    title: "Günün tatlısı ve filtre kahve",
    description: "Günün taze tatlısı yanında bir filtre kahve.",
    area: "Beşiktaş",
    category: "Kafe",
    priceUsdc: 6,
    originalValueUsdc: 12,
    stock: 30,
    sold: 11,
    expiresAt: "2027-02-28",
    status: "published",
    accent: "berry",
  },
  {
    id: "cmp_atolye_brunch",
    ownerWallet: "DemoMerchant33333333333333333333333333333",
    merchant: "Atölye Brunch",
    title: "Hafta içi öğrenci kahvaltısı",
    description: "Öğrenci kimliğiyle hafta içi geçerli kahvaltı menüsü.",
    area: "Şişli",
    category: "Kahvaltı",
    priceUsdc: 8,
    originalValueUsdc: 15,
    stock: 25,
    sold: 4,
    expiresAt: "2027-03-31",
    status: "published",
    accent: "lime",
  },
];

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): void {
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new StorageEvent("storage", { key }));
}

export function useMarketplace() {
  const [campaigns, setCampaigns] = useState<Campaign[]>(DEFAULT_CAMPAIGNS);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    setCampaigns(readStorage(CAMPAIGNS_KEY, DEFAULT_CAMPAIGNS));
    setVouchers(readStorage(VOUCHERS_KEY, []));
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === CAMPAIGNS_KEY || event.key === VOUCHERS_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const createCampaign = useCallback((draft: CampaignDraft) => {
    const current = readStorage(CAMPAIGNS_KEY, DEFAULT_CAMPAIGNS);
    const accents: Campaign["accent"][] = ["coffee", "berry", "lime", "ocean"];
    const campaign: Campaign = {
      ...draft,
      id: crypto.randomUUID(),
      sold: 0,
      status: "published",
      accent: accents[current.length % accents.length],
    };
    const next = [campaign, ...current];
    setCampaigns(next);
    writeStorage(CAMPAIGNS_KEY, next);
    return campaign;
  }, []);

  const purchaseCampaign = useCallback((campaignId: string, ownerWallet: string) => {
    const currentCampaigns = readStorage(CAMPAIGNS_KEY, DEFAULT_CAMPAIGNS);
    const campaign = currentCampaigns.find((item) => item.id === campaignId);
    if (!campaign || campaign.status !== "published") {
      throw new Error("Bu kampanya şu anda satın alınamıyor.");
    }
    if (campaign.sold >= campaign.stock) {
      throw new Error("Bu kampanyanın stoğu tükendi.");
    }
    if (campaign.ownerWallet === ownerWallet) {
      throw new Error("Kendi işletmenizin kuponunu satın alamazsınız.");
    }
    const currentVouchers = readStorage<Voucher[]>(VOUCHERS_KEY, []);
    if (
      currentVouchers.some(
        (voucher) =>
          voucher.campaignId === campaignId &&
          voucher.ownerWallet === ownerWallet &&
          voucher.status === "active",
      )
    ) {
      throw new Error("Bu kampanya için zaten aktif bir kuponunuz var.");
    }

    const nextCampaigns = currentCampaigns.map((item) =>
      item.id === campaignId ? { ...item, sold: item.sold + 1 } : item,
    );
    const voucher: Voucher = {
      id: crypto.randomUUID(),
      campaignId: campaign.id,
      ownerWallet,
      merchant: campaign.merchant,
      title: campaign.title,
      priceUsdc: campaign.priceUsdc,
      purchasedAt: new Date().toISOString(),
      expiresAt: campaign.expiresAt,
      code: `VLDX-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      status: "active",
    };

    const nextVouchers = [voucher, ...currentVouchers];
    setCampaigns(nextCampaigns);
    setVouchers(nextVouchers);
    writeStorage(CAMPAIGNS_KEY, nextCampaigns);
    writeStorage(VOUCHERS_KEY, nextVouchers);
    return voucher;
  }, []);

  const setCampaignStatus = useCallback((campaignId: string, status: Campaign["status"]) => {
    const current = readStorage(CAMPAIGNS_KEY, DEFAULT_CAMPAIGNS);
    const next = current.map((item) => (item.id === campaignId ? { ...item, status } : item));
    setCampaigns(next);
    writeStorage(CAMPAIGNS_KEY, next);
  }, []);

  return { campaigns, vouchers, ready, createCampaign, purchaseCampaign, setCampaignStatus };
}
