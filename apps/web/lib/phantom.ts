"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PhantomPublicKey = { toString(): string };

type PhantomProvider = {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: PhantomPublicKey | null;
  connect(): Promise<{ publicKey: PhantomPublicKey }>;
  disconnect(): Promise<void>;
  on?(event: "accountChanged", callback: (key: PhantomPublicKey | null) => void): void;
  removeListener?(event: "accountChanged", callback: (key: PhantomPublicKey | null) => void): void;
};

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  }
}

function getProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  return window.phantom?.solana ?? window.solana ?? null;
}

export function usePhantomWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const provider = getProvider();
    if (provider?.isConnected && provider.publicKey) setAddress(provider.publicKey.toString());

    const onAccountChanged = (key: PhantomPublicKey | null) => setAddress(key?.toString() ?? null);
    provider?.on?.("accountChanged", onAccountChanged);
    return () => provider?.removeListener?.("accountChanged", onAccountChanged);
  }, []);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider?.isPhantom) {
      setError("Phantom bulunamadı. Önce Phantom cüzdan eklentisini kurmalısınız.");
      return;
    }
    try {
      setConnecting(true);
      setError(null);
      const response = await provider.connect();
      setAddress(response.publicKey.toString());
    } catch {
      setError("Cüzdan bağlantısı kullanıcı tarafından reddedildi.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await getProvider()?.disconnect();
    setAddress(null);
  }, []);

  const shortAddress = useMemo(
    () => (address ? `${address.slice(0, 4)}…${address.slice(-4)}` : null),
    [address],
  );

  return { address, shortAddress, connecting, error, connect, disconnect };
}

