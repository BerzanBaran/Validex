"use client";

import { useEffect, useState } from "react";

import { authenticateWallet, clearStoredSession, getStoredSession } from "../lib/auth";
import { useSolanaWallet, WalletKind, walletInstallUrl } from "../lib/solanaWallet";

type WalletButtonProps = {
  onAddressChange?: (address: string | null) => void;
};

export function WalletButton({ onAddressChange }: WalletButtonProps) {
  const wallet = useSolanaWallet();
  const [authenticated, setAuthenticated] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);

  useEffect(() => {
    setAuthenticated(wallet.address ? getStoredSession(wallet.address) !== null : false);
  }, [wallet.address]);

  useEffect(() => {
    onAddressChange?.(authenticated ? wallet.address : null);
  }, [authenticated, onAddressChange, wallet.address]);

  async function connectAndAuthenticate(kind: WalletKind = wallet.kind) {
    setAuthError(null);
    setChooserOpen(false);
    const address = wallet.address ?? (await wallet.connect(kind));
    if (!address) return;
    try {
      setAuthenticating(true);
      await authenticateWallet(address, wallet.signMessage);
      setAuthenticated(true);
    } catch (error) {
      setAuthenticated(false);
      setAuthError(error instanceof Error ? error.message : "Wallet verification failed.");
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
        <span className="walletDot" /> {wallet.kind === "solflare" ? "Solflare" : "Phantom"} · {wallet.shortAddress}
      </button>
    );
  }

  return (
    <div className="walletWrap">
      <button
        className={`wallet ${wallet.address ? "walletPending" : ""}`}
        disabled={wallet.connecting || authenticating}
        onClick={() => wallet.address ? void connectAndAuthenticate() : setChooserOpen((open) => !open)}
        type="button"
      >
        {wallet.connecting
          ? "Connecting…"
          : authenticating
            ? "Waiting for signature…"
            : wallet.address
              ? `Sign in · ${wallet.shortAddress}`
              : "Connect wallet"}
      </button>
      {chooserOpen ? (
        <div className="walletMenu" role="dialog" aria-label="Choose a Solana wallet">
          <strong>Choose your wallet</strong>
          {(["solflare", "phantom"] as const).map((kind) => {
            const installed = wallet.isInstalled(kind);
            const label = kind === "solflare" ? "Solflare" : "Phantom";
            return installed ? (
              <button key={kind} onClick={() => void connectAndAuthenticate(kind)} type="button">
                <span className={`walletMark ${kind}`} /> <span>{label}<small>Continue with Solana</small></span>
              </button>
            ) : (
              <a href={walletInstallUrl(kind)} key={kind} rel="noreferrer" target="_blank">
                <span className={`walletMark ${kind}`} /> <span>{label}<small>Install extension ↗</small></span>
              </a>
            );
          })}
        </div>
      ) : null}
      {wallet.error || authError ? (
        <span className="walletError">{wallet.error ?? authError}</span>
      ) : null}
    </div>
  );
}
