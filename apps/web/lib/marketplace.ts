"use client";

import { useCallback, useEffect, useState } from "react";
import { listOnchainCampaigns } from "./campaignApi";
import {
  bytesFromHex, chainConfigured, loadChain, purchaseInstruction,
  sendWalletTransaction, usdcMinor,
} from "./validexChain";
import { ApiVoucher, confirmVoucherPurchase, createPurchaseIntent, listMyVouchers } from "./voucherApi";

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
  status: "published" | "paused" | "cancelled";
  accent: "coffee" | "berry" | "lime" | "ocean";
  chainCampaign?: string;
  chainId?: string;
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
  status: "pending" | "active" | "redeemed" | "refunded";
  redeemedAt?: string;
  chainVoucher?: string;
  transactionSignature?: string;
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
    setCampaigns(readStorage(CAMPAIGNS_KEY, chainConfigured() ? [] : DEFAULT_CAMPAIGNS));
    setVouchers(readStorage(VOUCHERS_KEY, []));
  }, []);

  useEffect(() => {
    refresh();
    if (chainConfigured()) {
      void listOnchainCampaigns().then((items) => {
        setCampaigns(items);
        writeStorage(CAMPAIGNS_KEY, items);
      }).catch(() => { setCampaigns([]); });
    }
    setReady(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === CAMPAIGNS_KEY || event.key === VOUCHERS_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const saveCampaign = useCallback((campaign: Campaign) => {
    const current = readStorage<Campaign[]>(CAMPAIGNS_KEY, []);
    const next = [campaign, ...current.filter((item) => item.id !== campaign.id)];
    writeStorage(CAMPAIGNS_KEY, next);
    setCampaigns(next);
  }, []);

  const purchaseCampaign = useCallback(async (campaignId: string, ownerWallet: string) => {
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
    if (!chainConfigured() || !campaign.chainCampaign) {
      throw new Error("Bu kampanya yalnızca ön izleme. Zincir ödemesi kurulmadan USDC tahsil edilmez.");
    }
    const currentVouchers = readStorage<Voucher[]>(VOUCHERS_KEY, []);
    if (currentVouchers.some((voucher) => voucher.campaignId === campaignId &&
      voucher.ownerWallet === ownerWallet && voucher.status === "active")) {
      throw new Error("Bu kampanya için zaten aktif bir kuponunuz var.");
    }
    const config = await loadChain();
    const pendingApi = (await listMyVouchers(ownerWallet)).find((item) => item.campaign_id === campaignId && item.status === "pending_chain");
    const intent = pendingApi ?? await createPurchaseIntent(campaignId, ownerWallet);
    const voucherHash = bytesFromHex(intent.voucher_hash_hex);
    const { instruction, voucher: voucherPda, priceMinor } = await purchaseInstruction(config, ownerWallet, campaign.chainCampaign, voucherHash);
    if (priceMinor !== usdcMinor(campaign.priceUsdc)) {
      throw new Error("Ekrandaki fiyat zincirdeki kampanya fiyatıyla eşleşmiyor. Ödeme durduruldu.");
    }
    const existing = currentVouchers.find((item) => item.id === intent.id);
    if (existing?.transactionSignature) {
      const confirmedApi = await confirmVoucherPurchase(intent.id, ownerWallet, voucherPda.toBase58(), existing.transactionSignature);
      if (confirmedApi.status === "active") {
        const recovered: Voucher = { ...existing, status: "active" };
        const next = [recovered, ...currentVouchers.filter((item) => item.id !== existing.id)];
        writeStorage(VOUCHERS_KEY, next);
        setVouchers(next);
        return recovered;
      }
    }
    const voucher: Voucher = {
      id: intent.id,
      campaignId: campaign.id,
      ownerWallet,
      merchant: campaign.merchant,
      title: campaign.title,
      priceUsdc: campaign.priceUsdc,
      purchasedAt: new Date().toISOString(),
      expiresAt: campaign.expiresAt,
      code: `VLDX-${intent.voucher_hash_hex.slice(0, 12).toUpperCase()}`,
      status: "pending",
      chainVoucher: voucherPda.toBase58(),
    };
    const currentWithoutStale = currentVouchers.filter((item) => item.id !== voucher.id);
    const pendingVouchers = [voucher, ...currentWithoutStale];
    writeStorage(VOUCHERS_KEY, pendingVouchers);
    setVouchers(pendingVouchers);
    const signature = await sendWalletTransaction(config, ownerWallet, instruction, voucherPda, (submitted) => {
      const submittedVoucher = { ...voucher, transactionSignature: submitted };
      writeStorage(VOUCHERS_KEY, [submittedVoucher, ...currentWithoutStale]);
      setVouchers([submittedVoucher, ...currentWithoutStale]);
    });
    await confirmVoucherPurchase(intent.id, ownerWallet, voucherPda.toBase58(), signature);
    const confirmed: Voucher = { ...voucher, status: "active", transactionSignature: signature };
    const nextVouchers = [confirmed, ...currentWithoutStale];
    const nextCampaigns = currentCampaigns.map((item) => item.id === campaignId ? { ...item, sold: item.sold + 1 } : item);
    writeStorage(VOUCHERS_KEY, nextVouchers);
    writeStorage(CAMPAIGNS_KEY, nextCampaigns);
    setVouchers(nextVouchers);
    setCampaigns(nextCampaigns);
    return confirmed;
  }, []);

  const syncMyVouchers = useCallback(async (walletAddress: string) => {
    const remote = await listMyVouchers(walletAddress);
    const current = readStorage<Voucher[]>(VOUCHERS_KEY, []);
    const currentCampaigns = readStorage<Campaign[]>(CAMPAIGNS_KEY, []);
    const mapped = remote.map((item: ApiVoucher): Voucher => {
      const campaign = currentCampaigns.find((entry) => entry.id === item.campaign_id);
      const local = current.find((entry) => entry.id === item.id);
      return {
        id: item.id, campaignId: item.campaign_id, ownerWallet: walletAddress,
        merchant: campaign?.merchant ?? local?.merchant ?? "İşletme",
        title: campaign?.title ?? local?.title ?? "Kupon",
        priceUsdc: campaign?.priceUsdc ?? local?.priceUsdc ?? 0,
        purchasedAt: item.purchased_at ?? local?.purchasedAt ?? new Date().toISOString(),
        expiresAt: item.expires_at,
        code: `VLDX-${item.voucher_hash_hex.slice(0, 12).toUpperCase()}`,
        status: item.status === "redeemed" ? "redeemed" : item.status === "refunded" ? "refunded" : item.status === "active" ? "active" : "pending",
        chainVoucher: item.onchain_address ?? local?.chainVoucher,
        transactionSignature: local?.transactionSignature,
        redeemedAt: local?.redeemedAt,
      };
    });
    const next = [...mapped, ...current.filter((item) => item.ownerWallet !== walletAddress)];
    writeStorage(VOUCHERS_KEY, next);
    setVouchers(next);
  }, []);

  const markRedeemed = useCallback((voucherId: string, signature: string) => {
    const currentVouchers = readStorage<Voucher[]>(VOUCHERS_KEY, []);
    const next = currentVouchers.map((item) => item.id === voucherId ?
      { ...item, status: "redeemed" as const, redeemedAt: new Date().toISOString(), transactionSignature: signature } : item);
    setVouchers(next);
    writeStorage(VOUCHERS_KEY, next);
  }, []);

  const markRefunded = useCallback((voucherId: string, signature: string) => {
    const current = readStorage<Voucher[]>(VOUCHERS_KEY, []);
    const next = current.map((item) => item.id === voucherId ?
      { ...item, status: "refunded" as const, transactionSignature: signature } : item);
    writeStorage(VOUCHERS_KEY, next);
    setVouchers(next);
  }, []);

  const confirmPendingVoucher = useCallback((voucherId: string) => {
    const currentVouchers = readStorage<Voucher[]>(VOUCHERS_KEY, []);
    const voucher = currentVouchers.find((item) => item.id === voucherId);
    if (!voucher || voucher.status !== "pending") return;
    const nextVouchers = currentVouchers.map((item) => item.id === voucherId ? { ...item, status: "active" as const } : item);
    const currentCampaigns = readStorage(CAMPAIGNS_KEY, DEFAULT_CAMPAIGNS);
    const nextCampaigns = currentCampaigns.map((item) => item.id === voucher.campaignId ? { ...item, sold: item.sold + 1 } : item);
    writeStorage(VOUCHERS_KEY, nextVouchers);
    writeStorage(CAMPAIGNS_KEY, nextCampaigns);
    setVouchers(nextVouchers);
    setCampaigns(nextCampaigns);
  }, []);

  return { campaigns, vouchers, ready, saveCampaign, purchaseCampaign, markRedeemed, markRefunded, confirmPendingVoucher, syncMyVouchers };
}
