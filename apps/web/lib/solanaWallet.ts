"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Transaction } from "@solana/web3.js";

export type WalletKind = "solflare" | "phantom";

type SolanaPublicKey = { toString(): string };

type SolanaProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isConnected?: boolean;
  publicKey?: SolanaPublicKey | null;
  connect(): Promise<{ publicKey?: SolanaPublicKey } | void>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array, display?: "utf8"): Promise<{ signature: Uint8Array }>;
  signTransaction?(transaction: Transaction): Promise<Transaction>;
  on?(event: "accountChanged", callback: (key: SolanaPublicKey | null) => void): void;
  removeListener?(event: "accountChanged", callback: (key: SolanaPublicKey | null) => void): void;
};

declare global {
  interface Window {
    phantom?: { solana?: SolanaProvider };
    solflare?: SolanaProvider;
    solana?: SolanaProvider;
  }
}

const PREFERRED_WALLET_KEY = "validex.preferred-wallet.v1";

function providerFor(kind: WalletKind): SolanaProvider | null {
  if (typeof window === "undefined") return null;
  if (kind === "solflare") {
    if (window.solflare?.isSolflare) return window.solflare;
    if (window.solana?.isSolflare) return window.solana;
    return null;
  }
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
  if (window.solana?.isPhantom) return window.solana;
  return null;
}

function preferredWallet(): WalletKind {
  if (typeof window === "undefined") return "solflare";
  const stored = window.localStorage.getItem(PREFERRED_WALLET_KEY);
  return stored === "phantom" ? "phantom" : "solflare";
}

export async function signSolanaTransaction(transaction: Transaction, expectedAddress: string): Promise<Transaction> {
  const provider = providerFor(preferredWallet());
  if (!provider?.publicKey || provider.publicKey.toString() !== expectedAddress) {
    throw new Error("İşlem için doğru Solflare/Phantom cüzdanını bağlayın.");
  }
  if (!provider.signTransaction) throw new Error("Bu cüzdan işlem imzalamayı desteklemiyor.");
  return provider.signTransaction(transaction);
}

export function walletInstallUrl(kind: WalletKind): string {
  return kind === "solflare" ? "https://www.solflare.com/download" : "https://phantom.com/download";
}

export function useSolanaWallet() {
  const [kind, setKind] = useState<WalletKind>("solflare");
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const selected = preferredWallet();
    setKind(selected);
    const provider = providerFor(selected);
    if (provider?.isConnected && provider.publicKey) setAddress(provider.publicKey.toString());

    const onAccountChanged = (key: SolanaPublicKey | null) => setAddress(key?.toString() ?? null);
    provider?.on?.("accountChanged", onAccountChanged);
    return () => provider?.removeListener?.("accountChanged", onAccountChanged);
  }, [kind]);

  const isInstalled = useCallback((walletKind: WalletKind) => providerFor(walletKind) !== null, []);

  const connect = useCallback(async (walletKind: WalletKind = kind): Promise<string | null> => {
    const provider = providerFor(walletKind);
    if (!provider) {
      setError(`${walletKind === "solflare" ? "Solflare" : "Phantom"} bulunamadı. Cüzdan eklentisini kurup sayfayı yenileyin.`);
      return null;
    }
    try {
      setConnecting(true);
      setError(null);
      const response = await provider.connect();
      const publicKey = response?.publicKey ?? provider.publicKey;
      if (!publicKey) throw new Error("Cüzdan adresi okunamadı.");
      const connectedAddress = publicKey.toString();
      window.localStorage.setItem(PREFERRED_WALLET_KEY, walletKind);
      setKind(walletKind);
      setAddress(connectedAddress);
      return connectedAddress;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cüzdan bağlantısı reddedildi.");
      return null;
    } finally {
      setConnecting(false);
    }
  }, [kind]);

  const signMessage = useCallback(async (message: string): Promise<string> => {
    const provider = providerFor(preferredWallet());
    if (!provider) throw new Error("Seçili Solana cüzdanı bulunamadı.");
    const response = await provider.signMessage(new TextEncoder().encode(message), "utf8");
    let binary = "";
    for (const byte of response.signature) binary += String.fromCharCode(byte);
    return window.btoa(binary);
  }, []);

  const disconnect = useCallback(async () => {
    await providerFor(kind)?.disconnect();
    setAddress(null);
    setError(null);
  }, [kind]);

  const shortAddress = useMemo(
    () => (address ? `${address.slice(0, 4)}…${address.slice(-4)}` : null),
    [address],
  );

  return { address, shortAddress, kind, connecting, error, connect, disconnect, signMessage, isInstalled };
}
