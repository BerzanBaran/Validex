"use client";

import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";

import { getOnchainCampaign, listOnchainCampaigns } from "./campaignApi";
import {
  bytesFromHex, chainConfigured, loadChain, purchaseInstruction,
  readVoucherStatus, sendWalletTransaction, usdcMinor, voucherPda,
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
  status: "pending" | "active" | "redeemed" | "refunded" | "expired" | "failed";
  redeemedAt?: string;
  chainVoucher?: string;
};

export type CampaignDraft = Omit<Campaign, "id" | "sold" | "status" | "accent">;

export function voucherFromApi(item: ApiVoucher, walletAddress: string, campaign?: Campaign): Voucher {
  return {
    id: item.id,
    campaignId: item.campaign_id,
    ownerWallet: walletAddress,
    merchant: item.merchant_name ?? campaign?.merchant ?? "İşletme",
    title: item.campaign_title ?? campaign?.title ?? "Kupon",
    priceUsdc: item.price_minor != null ? item.price_minor / 1_000_000 : campaign?.priceUsdc ?? 0,
    purchasedAt: item.purchased_at ?? "",
    expiresAt: item.expires_at,
    code: `VLDX-${item.voucher_hash_hex.slice(0, 12).toUpperCase()}`,
    status: item.status === "pending_chain" ? "pending" : item.status,
    redeemedAt: item.redeemed_at ?? undefined,
    chainVoucher: item.onchain_address ?? undefined,
  };
}

export function useMarketplace() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [ready, setReady] = useState(false);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [vouchersLoading, setVouchersLoading] = useState(false);
  const voucherRequest = useRef(0);

  const refreshCampaigns = useCallback(async () => {
    try {
      const remote = await listOnchainCampaigns();
      setCampaigns(remote);
      setCampaignError(null);
      return remote;
    } catch (error) {
      setCampaignError(error instanceof Error ? error.message : "Kampanyalar yüklenemedi.");
      throw error;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { void refreshCampaigns().catch(() => {}); }, [refreshCampaigns]);

  const saveCampaign = useCallback((campaign: Campaign) => {
    setCampaigns((current) => [campaign, ...current.filter((item) => item.id !== campaign.id)]);
  }, []);

  const clearVouchers = useCallback(() => {
    voucherRequest.current += 1;
    setVouchers([]);
    setVoucherError(null);
    setVouchersLoading(false);
  }, []);

  const syncMyVouchers = useCallback(async (walletAddress: string) => {
    const requestId = ++voucherRequest.current;
    setVouchersLoading(true);
    setVoucherError(null);
    try {
      let remote = await listMyVouchers(walletAddress);
      // A confirmed payment can outlive the tab. Recover pending records from
      // the voucher PDA without relying on browser-local voucher data.
      if (chainConfigured() && remote.some((item) => item.status === "pending_chain")) {
        try {
          const config = await loadChain();
          remote = await Promise.all(remote.map(async (item) => {
            if (item.status !== "pending_chain") return item;
            try {
              const campaign = await getOnchainCampaign(item.campaign_id);
              if (!campaign.chainCampaign) return item;
              const address = voucherPda(config, new PublicKey(campaign.chainCampaign), bytesFromHex(item.voucher_hash_hex));
              if (await readVoucherStatus(config, address) !== "active") return item;
              const signature = (await config.connection.getSignaturesForAddress(address, { limit: 1 }, "finalized"))[0]?.signature;
              if (!signature) return item;
              const confirmed = await confirmVoucherPurchase(item.id, walletAddress, address.toBase58(), signature);
              return { ...item, ...confirmed, campaign_title: item.campaign_title,
                merchant_name: item.merchant_name, price_minor: item.price_minor };
            } catch { return item; }
          }));
        } catch {
          // Keep PostgreSQL's pending state; never guess that payment succeeded.
        }
      }
      if (requestId === voucherRequest.current) {
        setVouchers(remote.map((item) => voucherFromApi(item, walletAddress)));
      }
    } catch (error) {
      if (requestId === voucherRequest.current) {
        setVouchers([]);
        setVoucherError(error instanceof Error ? error.message : "Kuponlar API'den yüklenemedi.");
      }
      throw error;
    } finally {
      if (requestId === voucherRequest.current) setVouchersLoading(false);
    }
  }, []);

  const purchaseCampaign = useCallback(async (
    campaignId: string, ownerWallet: string, onSubmitted?: (signature: string) => void,
  ) => {
    if (!chainConfigured()) throw new Error("Zincir ödemesi kurulmadan USDC tahsil edilmez.");
    const campaign = await getOnchainCampaign(campaignId);
    if (campaign.status !== "published" || !campaign.chainCampaign ||
        campaign.sold >= campaign.stock || new Date(campaign.expiresAt).getTime() <= Date.now()) {
      throw new Error("Bu kampanya şu anda satın alınamıyor.");
    }
    if (campaign.ownerWallet === ownerWallet) throw new Error("Kendi işletmenizin kuponunu satın alamazsınız.");
    const remote = await listMyVouchers(ownerWallet);
    if (remote.some((item) => item.campaign_id === campaignId && item.status === "active")) {
      throw new Error("Bu kampanya için zaten aktif bir kuponunuz var.");
    }
    const intent = remote.find((item) => item.campaign_id === campaignId && item.status === "pending_chain")
      ?? await createPurchaseIntent(campaignId, ownerWallet);
    setVouchers((current) => [voucherFromApi(intent, ownerWallet, campaign), ...current.filter((item) => item.id !== intent.id)]);

    const config = await loadChain();
    const hash = bytesFromHex(intent.voucher_hash_hex);
    const address = voucherPda(config, new PublicKey(campaign.chainCampaign), hash);
    const existingStatus = await readVoucherStatus(config, address);
    if (existingStatus !== "missing") {
      if (existingStatus !== "active") throw new Error("Kupon zincirde zaten işlenmiş; yeniden ödeme yapmayın.");
      const signature = (await config.connection.getSignaturesForAddress(address, { limit: 1 }, "finalized"))[0]?.signature;
      if (!signature) throw new Error("Zincirdeki ödeme imzası bulunamadı. Yeniden ödeme yapmayın.");
      const confirmed = await confirmVoucherPurchase(intent.id, ownerWallet, address.toBase58(), signature);
      const voucher = voucherFromApi(confirmed, ownerWallet, campaign);
      setVouchers((current) => [voucher, ...current.filter((item) => item.id !== voucher.id)]);
      void refreshCampaigns().catch(() => {});
      return voucher;
    }
    const { instruction, priceMinor } = await purchaseInstruction(config, ownerWallet, campaign.chainCampaign, hash);
    if (priceMinor !== usdcMinor(campaign.priceUsdc)) {
      throw new Error("API fiyatı zincirdeki kampanya fiyatıyla eşleşmiyor. Ödeme durduruldu.");
    }
    const signature = await sendWalletTransaction(config, ownerWallet, instruction, address, onSubmitted);
    const confirmed = await confirmVoucherPurchase(intent.id, ownerWallet, address.toBase58(), signature);
    const voucher = voucherFromApi(confirmed, ownerWallet, campaign);
    setVouchers((current) => [voucher, ...current.filter((item) => item.id !== voucher.id)]);
    void refreshCampaigns().catch(() => {});
    return voucher;
  }, [refreshCampaigns]);

  return {
    campaigns, vouchers, ready, campaignError, voucherError, vouchersLoading,
    refreshCampaigns, saveCampaign, clearVouchers, syncMyVouchers, purchaseCampaign,
  };
}
