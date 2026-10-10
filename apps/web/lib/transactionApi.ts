"use client";

import { getStoredSession } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type ChainTransactionStatus = "pending" | "confirmed" | "finalized" | "failed";

export async function getTransactionStatus(signature: string, walletAddress: string): Promise<ChainTransactionStatus> {
  const session = getStoredSession(walletAddress);
  if (!session) throw new Error("Wallet session not found.");
  const response = await fetch(
    `${API_URL}/api/v1/transactions/${encodeURIComponent(signature)}/status`,
    { headers: { Authorization: `Bearer ${session.accessToken}` }, cache: "no-store" },
  );
  if (!response.ok) throw new Error("Could not load transaction status from the API.");
  const body = await response.json() as { status: ChainTransactionStatus };
  return body.status;
}
