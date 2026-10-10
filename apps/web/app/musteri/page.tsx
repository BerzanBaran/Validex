"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { DashboardHeader } from "../../components/DashboardHeader";
import { useMarketplace } from "../../lib/marketplace";
import { useSolanaBalances } from "../../lib/solanaRpc";
import { chainConfigured } from "../../lib/validexChain";
import { voucherAction } from "../../lib/voucherPolicy";

export default function CustomerDashboard() {
  const marketplace = useMarketplace();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const balances = useSolanaBalances(walletAddress);

  useEffect(() => {
    if (walletAddress) void marketplace.syncMyVouchers(walletAddress).catch(() => {});
    else marketplace.clearVouchers();
  }, [walletAddress, marketplace.syncMyVouchers, marketplace.clearVouchers]);

  const campaigns = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en-US");
    return marketplace.campaigns.filter(
      (campaign) =>
        campaign.status === "published" &&
        campaign.sold < campaign.stock &&
        new Date(campaign.expiresAt).getTime() > Date.now() &&
        (!normalized ||
          `${campaign.title} ${campaign.merchant} ${campaign.area}`
            .toLocaleLowerCase("en-US")
            .includes(normalized)),
    );
  }, [marketplace.campaigns, query]);

  const myVouchers = marketplace.vouchers.filter(
    (voucher) => walletAddress && voucher.ownerWallet === walletAddress,
  );

  return (
    <main className="dashboardPage customerDashboard">
      <DashboardHeader role="customer" onAddressChange={setWalletAddress} />
      <section className="dashboardShell dashboardHero">
        <div>
          <p className="eyebrow"><span className="sparkle">✳</span> DISCOVERY SPACE / CUSTOMER</p>
          <h1>A good day<br /><em>starts nearby.</em></h1>
          <p>Discover great offers in your neighborhood. Buy your favorite with your wallet and keep its QR code close.</p>
        </div>
        <div className="balanceCard">
          <span>DEVNET WALLET BALANCE</span>
          <strong>{!walletAddress ? "Wallet not connected" : balances.status === "loading" ? "Loading…" : balances.usdcBalance === null ? "USDC mint not configured" : `${balances.usdcBalance.toFixed(2)} USDC`}</strong>
          <small>{balances.status === "error" ? "Could not connect to Solana RPC." : walletAddress && balances.solBalance !== null ? `${balances.solBalance.toFixed(4)} SOL · ${balances.network}` : balances.network}</small>
        </div>
      </section>

      <section className="dashboardShell dashboardContent">
        <div className="contentHeading">
          <div><p className="eyebrow">THIS WEEK'S FINDS</p><h2>Pick one. Enjoy more.</h2></div>
          <input
            aria-label="Search offers"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search business, area, or offer"
            type="search"
            value={query}
          />
        </div>
        <div className="marketGrid">
          {campaigns.map((campaign) => (
            <article className="marketCard" key={campaign.id}>
              <div className={`marketVisual ${campaign.accent}`}>
                <span>{campaign.area}</span>
                <div><b>{campaign.priceUsdc}</b><small>USDC</small></div>
                <i aria-hidden="true">✳</i>
              </div>
              <div className="marketCopy">
                <p>{campaign.merchant} · {campaign.category}</p>
                <h3>{campaign.title}</h3>
                <p className="description">{campaign.description}</p>
                <div className="stockLine"><span>Worth {campaign.originalValueUsdc} USDC</span><span>{campaign.stock - campaign.sold} left</span></div>
                <div className="cardActions"><Link className="secondaryButton" href={`/kampanyalar/${campaign.id}`}>Details</Link><Link className="actionButton" href={`/kampanyalar/${campaign.id}`}>Buy voucher</Link></div>
              </div>
            </article>
          ))}
        </div>
        {marketplace.campaignError ? <div className="emptyState" role="alert">Offers could not be loaded: {marketplace.campaignError} <button className="secondaryButton" onClick={() => void marketplace.refreshCampaigns().catch(() => {})} type="button">Try again</button></div> : !marketplace.ready ? <div className="emptyState loadingState" aria-live="polite">Loading nearby offers…</div> : !campaigns.length ? <div className="emptyState">No active offers match your search.</div> : null}
      </section>

      <section className="dashboardShell vouchersSection">
        <div className="contentHeading"><div><p className="eyebrow">GOOD PLANS IN YOUR POCKET</p><h2>My vouchers <span className="headingSpark">✳</span></h2></div><span>{myVouchers.filter((voucher) => voucherAction(voucher) === "redeem").length} ready to redeem</span></div>
        {!walletAddress ? (
          <div className="emptyState">Connect your Solflare or Phantom wallet to see your vouchers.</div>
        ) : marketplace.vouchersLoading ? (
          <div className="emptyState">Loading your vouchers…</div>
        ) : marketplace.voucherError ? (
          <div className="emptyState" role="alert">{marketplace.voucherError} <button className="secondaryButton" onClick={() => void marketplace.syncMyVouchers(walletAddress).catch(() => {})} type="button">Try again</button></div>
        ) : myVouchers.length ? (
          <div className="voucherList">
            {myVouchers.map((voucher) => (
              <Link className="voucherRow" href={`/musteri/kuponlar/${voucher.id}`} key={voucher.id}>
                <div><span className="statusPill">{voucher.status === "pending" ? "VERIFYING ON-CHAIN" : voucher.status === "redeemed" ? "REDEEMED" : voucher.status === "refunded" ? "REFUNDED" : voucherAction(voucher) === "refund" ? "REFUND AVAILABLE" : voucherAction(voucher) === "redeem" ? "ACTIVE" : "CLOSED"}</span><h3>{voucher.title}</h3><p>{voucher.merchant} · Expires {voucher.expiresAt}</p></div>
                <div className="voucherCode"><small>VOUCHER REFERENCE</small><strong>{voucher.code}</strong></div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="emptyState">You haven't bought a voucher yet.</div>
        )}
      </section>

      <div className="demoBanner">{chainConfigured() ? "USDC payments require your wallet signature and on-chain confirmation." : "Payments are disabled until the program and USDC mint are configured."}</div>
    </main>
  );
}
