"use client";

import { getStoredSession } from "./auth";
import type { Campaign, CampaignDraft } from "./marketplace";
import { usdcMinor } from "./validexChain";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type ApiCampaign = {
  id: string; external_id: string; merchant_id: string; merchant_wallet: string | null;
  merchant_name: string | null; merchant_address: string | null; title: string;
  description: string; price_minor: number; original_value_minor: number;
  stock: number; sold_count: number; starts_at: string; expires_at: string;
  status: "draft" | "published" | "paused" | "cancelled" | "expired";
  onchain_address: string | null;
};

function toCampaign(item: ApiCampaign): Campaign {
  return {
    id: item.id,
    ownerWallet: item.merchant_wallet ?? "",
    merchant: item.merchant_name ?? "Merchant",
    title: item.title,
    description: item.description,
    area: item.merchant_address ?? "Local",
    category: "Local",
    priceUsdc: item.price_minor / 1_000_000,
    originalValueUsdc: item.original_value_minor / 1_000_000,
    stock: item.stock,
    sold: item.sold_count,
    expiresAt: item.expires_at,
    status: item.status === "published" ? "published" : item.status === "cancelled" ? "cancelled" : "paused",
    accent: "ocean",
    chainCampaign: item.onchain_address ?? undefined,
    chainId: item.external_id,
  };
}

export async function listOnchainCampaigns(): Promise<Campaign[]> {
  const pageSize = 100;
  async function loadStatus(status: "published" | "cancelled"): Promise<ApiCampaign[]> {
    const all: ApiCampaign[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const response = await fetch(`${API_URL}/api/v1/campaigns?status=${status}&limit=${pageSize}&offset=${offset}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load offers from the API.");
      const page = await response.json() as ApiCampaign[];
      all.push(...page);
      if (page.length < pageSize) return all;
    }
  }
  const groups = await Promise.all([loadStatus("published"), loadStatus("cancelled")]);
  return groups.flat().map(toCampaign);
}

export async function getOnchainCampaign(campaignId: string): Promise<Campaign> {
  const response = await fetch(`${API_URL}/api/v1/campaigns/${encodeURIComponent(campaignId)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load the offer from the API.");
  return toCampaign(await response.json() as ApiCampaign);
}

export async function publishOnchainCampaign(input: {
  walletAddress: string; merchantId: string; draft: CampaignDraft;
  campaignAddress: string; chainId: string; signature: string;
  startsAt: number; expiresAt: number;
}): Promise<Campaign> {
  const session = getStoredSession(input.walletAddress);
  if (!session) throw new Error("Merchant session not found. Reconnect your wallet.");
  const payload = {
    merchant_id: input.merchantId,
    external_id: input.chainId,
    title: input.draft.title,
    description: input.draft.description,
    terms: "",
    price_minor: Number(usdcMinor(input.draft.priceUsdc)),
    original_value_minor: Number(usdcMinor(input.draft.originalValueUsdc)),
    stock: input.draft.stock,
    per_user_limit: 1,
    starts_at: new Date(input.startsAt * 1000).toISOString(),
    expires_at: new Date(input.expiresAt * 1000).toISOString(),
    onchain_address: input.campaignAddress,
    transaction_signature: input.signature,
  };
  const response = await fetch(`${API_URL}/api/v1/campaigns/onchain`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(`The offer was created on-chain, but the API record failed: ${body?.detail ?? response.status}. Do not submit another on-chain transaction.`);
  }
  return toCampaign(await response.json() as ApiCampaign);
}

export async function confirmCampaignCancellation(campaignId: string, walletAddress: string, signature: string): Promise<Campaign> {
  const session = getStoredSession(walletAddress);
  if (!session) throw new Error("Merchant session not found.");
  const response = await fetch(`${API_URL}/api/v1/campaigns/${campaignId}/cancel-confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({ transaction_signature: signature }),
  });
  if (!response.ok) throw new Error("The offer was cancelled on-chain, but the API state could not be updated. Do not submit it again.");
  return toCampaign(await response.json() as ApiCampaign);
}
