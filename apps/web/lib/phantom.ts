"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PhantomPublicKey = { toString(): string };

type PhantomProvider = {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: PhantomPublicKey | null;
  connect(): Promise<{ publicKey: PhantomPublicKey }>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array, display?: "utf8"): Promise<{ signature: Uint8Array }>;
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

  const connect = useCallback(async (): Promise<string | null> => {
    const provider = getProvider();
    if (!provider?.isPhantom) {
      setError("Phantom bulunamadı. Önce Phantom cüzdan eklentisini kurmalısınız.");
      return null;
    }
    try {
      setConnecting(true);
      setError(null);
      const response = await provider.connect();
      const connectedAddress = response.publicKey.toString();
      setAddress(connectedAddress);
      return connectedAddress;
    } catch {
      setError("Cüzdan bağlantısı kullanıcı tarafından reddedildi.");
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const signMessage = useCallback(async (message: string): Promise<string> => {
    const provider = getProvider();
    if (!provider?.isPhantom) throw new Error("Phantom cüzdanı bulunamadı.");
    const encoded = new TextEncoder().encode(message);
    const response = await provider.signMessage(encoded, "utf8");
    let binary = "";
    for (const byte of response.signature) binary += String.fromCharCode(byte);
    return window.btoa(binary);
  }, []);

  const disconnect = useCallback(async () => {
    await getProvider()?.disconnect();
    setAddress(null);
  }, []);

  const shortAddress = useMemo(
    () => (address ? `${address.slice(0, 4)}…${address.slice(-4)}` : null),
    [address],
  );

  return { address, shortAddress, connecting, error, connect, disconnect, signMessage };
}
