"use client";

import { useEffect } from "react";

import { usePhantomWallet } from "../lib/phantom";

type WalletButtonProps = {
  onAddressChange?: (address: string | null) => void;
};

export function WalletButton({ onAddressChange }: WalletButtonProps) {
  const wallet = usePhantomWallet();

  useEffect(() => {
    onAddressChange?.(wallet.address);
  }, [onAddressChange, wallet.address]);

  if (wallet.address) {
    return (
      <button className="wallet walletConnected" onClick={wallet.disconnect} type="button">
        <span className="walletDot" /> {wallet.shortAddress}
      </button>
    );
  }

  return (
    <div className="walletWrap">
      <button className="wallet" disabled={wallet.connecting} onClick={wallet.connect} type="button">
        {wallet.connecting ? "Bağlanıyor…" : "Phantom'u bağla"}
      </button>
      {wallet.error ? <span className="walletError">{wallet.error}</span> : null}
    </div>
  );
}
