"use client";

import { getStoredSession } from "./auth";

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

function tokenFor(walletAddress: string): string {
  const session = getStoredSession(walletAddress);
  if (!session) throw new Error("Cüzdan oturumu bulunamadı. Cüzdanı yeniden bağlayın.");
  return session.accessToken;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { detail?: string };
    return body.detail ?? "API işlemi tamamlanamadı.";
  } catch {
    return "API işlemi tamamlanamadı.";
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

export async function listMerchantApplications(walletAddress: string): Promise<MerchantProfile[]> {
  const response = await authorizedFetch("/api/v1/admin/merchants?status=pending", walletAddress);
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
