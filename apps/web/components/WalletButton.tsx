"use client";

import { useEffect, useState } from "react";

import { authenticateWallet, clearStoredSession, getStoredSession } from "../lib/auth";
import { usePhantomWallet } from "../lib/phantom";

type WalletButtonProps = {
  onAddressChange?: (address: string | null) => void;
};

export function WalletButton({ onAddressChange }: WalletButtonProps) {
  const wallet = usePhantomWallet();
  const [authenticated, setAuthenticated] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    setAuthenticated(wallet.address ? getStoredSession(wallet.address) !== null : false);
  }, [wallet.address]);

  useEffect(() => {
    onAddressChange?.(authenticated ? wallet.address : null);
  }, [authenticated, onAddressChange, wallet.address]);

  async function connectAndAuthenticate() {
    setAuthError(null);
    const address = wallet.address ?? (await wallet.connect());
    if (!address) return;
    try {
      setAuthenticating(true);
      await authenticateWallet(address, wallet.signMessage);
      setAuthenticated(true);
    } catch (error) {
      setAuthenticated(false);
      setAuthError(error instanceof Error ? error.message : "Cüzdan doğrulanamadı.");
    } finally {
      setAuthenticating(false);
    }
  }

  async function disconnect() {
    clearStoredSession();
    setAuthenticated(false);
    await wallet.disconnect();
  }

  if (wallet.address && authenticated) {
    return (
      <button className="wallet walletConnected" onClick={disconnect} type="button">
        <span className="walletDot" /> {wallet.shortAddress}
      </button>
    );
  }

  return (
    <div className="walletWrap">
      <button
        className={`wallet ${wallet.address ? "walletPending" : ""}`}
        disabled={wallet.connecting || authenticating}
        onClick={connectAndAuthenticate}
        type="button"
      >
        {wallet.connecting
          ? "Bağlanıyor…"
          : authenticating
            ? "İmza bekleniyor…"
            : wallet.address
              ? `Girişi imzala · ${wallet.shortAddress}`
              : "Phantom'u bağla"}
      </button>
      {wallet.error || authError ? (
        <span className="walletError">{wallet.error ?? authError}</span>
      ) : null}
    </div>
  );
}
