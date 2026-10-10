"use client";

import { getStoredSession } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type ApiVoucher = {
  id: string; campaign_id: string; status: "pending_chain" | "active" | "redeemed" | "refunded" | "expired" | "failed";
  expires_at: string; purchased_at: string | null; onchain_address: string | null;
  secret_base64: string; voucher_hash_hex: string;
  price_minor?: number;
  campaign_title?: string | null; merchant_name?: string | null; redeemed_at?: string | null;
  campaign_cancelled: boolean;
};

async function request(path: string, walletAddress: string, init?: RequestInit): Promise<ApiVoucher | ApiVoucher[]> {
  const session = getStoredSession(walletAddress);
  if (!session) throw new Error("Wallet session not found. Reconnect your wallet.");
  const response = await fetch(`${API_URL}/api/v1/vouchers${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}`, ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail ?? "The voucher API action could not be completed.");
  }
  return response.json() as Promise<ApiVoucher | ApiVoucher[]>;
}

export async function createPurchaseIntent(campaignId: string, walletAddress: string): Promise<ApiVoucher> {
  return request("/purchase-intent", walletAddress, { method: "POST", body: JSON.stringify({ campaign_id: campaignId }) }) as Promise<ApiVoucher>;
}

export async function confirmVoucherPurchase(voucherId: string, walletAddress: string, chainAddress: string, signature: string): Promise<ApiVoucher> {
  return request(`/${voucherId}/confirm`, walletAddress, {
    method: "POST", body: JSON.stringify({ onchain_address: chainAddress, transaction_signature: signature }),
  }) as Promise<ApiVoucher>;
}

export async function confirmVoucherRedemption(voucherId: string, walletAddress: string, chainAddress: string, signature: string): Promise<ApiVoucher> {
  return request(`/${voucherId}/redeem-confirm`, walletAddress, {
    method: "POST", body: JSON.stringify({ onchain_address: chainAddress, transaction_signature: signature }),
  }) as Promise<ApiVoucher>;
}

export async function confirmVoucherRefund(voucherId: string, walletAddress: string, chainAddress: string, signature: string): Promise<ApiVoucher> {
  return request(`/${voucherId}/refund-confirm`, walletAddress, {
    method: "POST", body: JSON.stringify({ onchain_address: chainAddress, transaction_signature: signature }),
  }) as Promise<ApiVoucher>;
}

export async function listMyVouchers(walletAddress: string): Promise<ApiVoucher[]> {
  return request("/my", walletAddress) as Promise<ApiVoucher[]>;
}
