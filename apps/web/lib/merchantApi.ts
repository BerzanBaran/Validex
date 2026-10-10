"use client";

import { getStoredSession } from "./auth";
import type { VoucherPass } from "./voucherQr";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type MerchantProfile = {
  id: string;
  owner_user_id: string;
  wallet_address: string;
  business_name: string;
  description: string;
  address: string;
  latitude: string | null;
  longitude: string | null;
  verification_status: "pending" | "verified" | "rejected";
  created_at: string;
};

export type MerchantApplication = {
  business_name: string;
  description: string;
  address: string;
};

export type StaffWallet = { id: string; merchant_id: string; wallet_address: string; active: boolean; created_at: string };
export type StaffCampaign = { campaign_id: string; title: string; merchant_name: string };
export type ScanResult = {
  voucher_id: string; campaign_id: string; campaign_title: string;
  owner_wallet: string; chain_voucher: string; can_prepare_redemption: boolean;
};
export type AuditEvent = {
  id: string; action: string; actor_wallet: string | null;
  entity_type: string; entity_id: string; created_at: string;
};

function tokenFor(walletAddress: string): string {
  const session = getStoredSession(walletAddress);
  if (!session) throw new Error("Wallet session not found. Reconnect your wallet.");
  return session.accessToken;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { detail?: string };
    return body.detail ?? "The API action could not be completed.";
  } catch {
    return "The API action could not be completed.";
  }
}

async function authorizedFetch(path: string, walletAddress: string, init?: RequestInit) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenFor(walletAddress)}`,
      ...init?.headers,
    },
  });
  return response;
}

export async function getMyMerchant(walletAddress: string): Promise<MerchantProfile | null> {
  const response = await authorizedFetch("/api/v1/merchants/me", walletAddress);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<MerchantProfile>;
}

export async function createMerchantApplication(
  walletAddress: string,
  application: MerchantApplication,
): Promise<MerchantProfile> {
  const response = await authorizedFetch("/api/v1/merchants", walletAddress, {
    method: "POST",
    body: JSON.stringify(application),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<MerchantProfile>;
}

export async function listMerchantApplications(walletAddress: string, status: "pending" | "verified" = "pending"): Promise<MerchantProfile[]> {
  const response = await authorizedFetch(`/api/v1/admin/merchants?status=${status}`, walletAddress);
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<MerchantProfile[]>;
}

export async function decideMerchantApplication(
  walletAddress: string,
  merchantId: string,
  approved: boolean,
): Promise<MerchantProfile> {
  const response = await authorizedFetch(
    `/api/v1/admin/merchants/${merchantId}/decision`,
    walletAddress,
    { method: "POST", body: JSON.stringify({ approved, reason: "" }) },
  );
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<MerchantProfile>;
}

export async function listStaff(walletAddress: string): Promise<StaffWallet[]> {
  const response = await authorizedFetch("/api/v1/merchants/me/staff", walletAddress);
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<StaffWallet[]>;
}

export async function grantStaff(walletAddress: string, staffWallet: string): Promise<StaffWallet> {
  const response = await authorizedFetch("/api/v1/merchants/me/staff", walletAddress, {
    method: "POST", body: JSON.stringify({ wallet_address: staffWallet }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<StaffWallet>;
}

export async function revokeStaff(walletAddress: string, staffId: string): Promise<void> {
  const response = await authorizedFetch(`/api/v1/merchants/me/staff/${staffId}`, walletAddress, { method: "DELETE" });
  if (!response.ok) throw new Error(await readError(response));
}

export async function listStaffCampaigns(walletAddress: string): Promise<StaffCampaign[]> {
  const response = await authorizedFetch("/api/v1/merchants/staff/campaigns", walletAddress);
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<StaffCampaign[]>;
}

export async function getCampaignScanRole(walletAddress: string, campaignId: string): Promise<"owner" | "staff" | null> {
  const response = await authorizedFetch(`/api/v1/merchants/campaigns/${campaignId}/scan-access`, walletAddress);
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json() as { role: "owner" | "staff" | null }).role;
}

export async function verifyVoucherQr(walletAddress: string, pass: VoucherPass): Promise<ScanResult> {
  const response = await authorizedFetch("/api/v1/vouchers/scan", walletAddress, {
    method: "POST", body: JSON.stringify(pass),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<ScanResult>;
}

export async function listAuditEvents(walletAddress: string, suspiciousOnly = false): Promise<AuditEvent[]> {
  const response = await authorizedFetch(`/api/v1/admin/audit?suspicious_only=${suspiciousOnly}&limit=50`, walletAddress);
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<AuditEvent[]>;
}
