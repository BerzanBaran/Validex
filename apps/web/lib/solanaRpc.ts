"use client";

import { useEffect, useState } from "react";

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const USDC_MINT = process.env.NEXT_PUBLIC_USDC_MINT;

type RpcState = {
  status: "idle" | "loading" | "online" | "error";
  solBalance: number | null;
  usdcBalance: number | null;
  network: string;
};

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error("Solana RPC bağlantısı kurulamadı.");
  const payload = await response.json() as { result?: T; error?: { message?: string } };
  if (payload.error || payload.result === undefined) throw new Error(payload.error?.message ?? "RPC yanıtı geçersiz.");
  return payload.result;
}

export function useSolanaBalances(address: string | null): RpcState {
  const [state, setState] = useState<RpcState>({ status: "idle", solBalance: null, usdcBalance: null, network: "Solana Devnet" });

  useEffect(() => {
    if (!address) {
      setState({ status: "idle", solBalance: null, usdcBalance: null, network: "Solana Devnet" });
      return;
    }
    let active = true;
    setState((current) => ({ ...current, status: "loading" }));
    void (async () => {
      try {
        const balance = await rpc<{ value: number }>("getBalance", [address, { commitment: "confirmed" }]);
        let usdcBalance: number | null = null;
        if (USDC_MINT) {
          const accounts = await rpc<{ value: Array<{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: number | null } } } } } }> }>(
            "getTokenAccountsByOwner",
            [address, { mint: USDC_MINT }, { encoding: "jsonParsed", commitment: "confirmed" }],
          );
          usdcBalance = accounts.value.reduce((sum, item) => sum + (item.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
        }
        if (active) setState({ status: "online", solBalance: balance.value / 1_000_000_000, usdcBalance, network: "Solana Devnet" });
      } catch {
        if (active) setState({ status: "error", solBalance: null, usdcBalance: null, network: "Solana Devnet" });
      }
    })();
    return () => { active = false; };
  }, [address]);

  return state;
}
