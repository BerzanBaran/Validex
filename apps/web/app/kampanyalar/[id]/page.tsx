"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DashboardHeader } from "../../../components/DashboardHeader";
import { CapacityMeter } from "../../../components/ui/CapacityMeter";
import { ShareDialog } from "../../../components/ui/ShareDialog";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { TransactionFeedback, TransactionPhase } from "../../../components/ui/TransactionFeedback";
import { useMarketplace } from "../../../lib/marketplace";
import { ChainTransactionStatus, getTransactionStatus } from "../../../lib/transactionApi";
import { chainConfigured } from "../../../lib/validexChain";

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const marketplace = useMarketplace();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [phase, setPhase] = useState<TransactionPhase>("idle");
  const [message, setMessage] = useState<string>();
  const [signature, setSignature] = useState<string | null>(null);
  const [chainStatus, setChainStatus] = useState<ChainTransactionStatus | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const campaign = useMemo(() => marketplace.campaigns.find((item) => item.id === id), [id, marketplace.campaigns]);

  useEffect(() => {
    if (!signature || !walletAddress) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const status = await getTransactionStatus(signature!, walletAddress!);
        if (cancelled) return;
        setChainStatus(status);
        if (status === "pending" || status === "confirmed") timer = setTimeout(() => void poll(), 3000);
      } catch {
        if (!cancelled) timer = setTimeout(() => void poll(), 5000);
      }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [signature, walletAddress]);

  async function purchase() {
    if (!walletAddress) {
      setPhase("failed");
      setMessage("Connect your Solflare or Phantom wallet before buying.");
      return;
    }
    setPhase("preparing");
    setMessage(undefined);
    setSignature(null);
    setChainStatus(null);
    try {
      const voucher = await marketplace.purchaseCampaign(id, walletAddress, setSignature);
      setPhase("confirmed");
      window.setTimeout(() => router.push(`/musteri/kuponlar/${voucher.id}`), 650);
    } catch (error) {
      setPhase("failed");
      setMessage(error instanceof Error ? error.message : "Could not create the voucher.");
    }
  }

  if (!marketplace.ready) return <main className="dashboardPage"><div className="pageState">Loading offer…</div></main>;
  if (!campaign) return <main className="dashboardPage"><div className="pageState"><h1>{marketplace.campaignError ? "Offer could not be loaded" : "Offer not found"}</h1>{marketplace.campaignError ? <p>{marketplace.campaignError}</p> : null}<Link href="/musteri">Back to offers</Link></div></main>;

  const expired = new Date(campaign.expiresAt).getTime() <= Date.now();
  const soldOut = campaign.sold >= campaign.stock;
  const available = campaign.status === "published" && !expired && !soldOut &&
    chainConfigured() && Boolean(campaign.chainCampaign);
  const discount = Math.round((1 - campaign.priceUsdc / campaign.originalValueUsdc) * 100);
  const shareUrl = typeof window === "undefined" ? "" : window.location.href;

  return (
    <main className="dashboardPage detailPage">
      <DashboardHeader role="customer" onAddressChange={setWalletAddress} />
      <div className="dashboardShell breadcrumb"><Link href="/musteri">← Offers</Link><span>/</span><span>{campaign.merchant}</span></div>
      <section className="dashboardShell campaignDetailHero">
        <div className={`campaignDetailVisual ${campaign.accent}`}>
          <StatusBadge tone={available ? "success" : "warning"}>{available ? "AVAILABLE" : soldOut ? "SOLD OUT" : "CLOSED"}</StatusBadge>
          <div><span>Validex local offer</span><strong>{discount}%</strong><small>off</small></div>
        </div>
        <div className="campaignDetailCopy">
          <div className="detailTopline"><p className="eyebrow">{campaign.merchant} · {campaign.category} · {campaign.area}</p><button className="secondaryButton" onClick={() => setShareOpen(true)}>Share ↗</button></div>
          <h1>{campaign.title}</h1>
          <p className="detailLead">{campaign.description}</p>
          <div className="pricePanel"><div><strong>{campaign.priceUsdc}</strong><span>USDC</span></div><p><s>{campaign.originalValueUsdc} USDC</s><br />Per voucher</p></div>
          <CapacityMeter sold={campaign.sold} stock={campaign.stock} />
          <TransactionFeedback phase={phase} message={message} />
          {signature ? <p className="chainDisclosure" role="status">Transaction signature: {signature}<br />Network status: {chainStatus === "confirmed" ? "confirmed — awaiting finality" : chainStatus === "finalized" ? "finalized" : chainStatus === "failed" ? "failed" : "pending"}</p> : null}
          <button className="actionButton detailPurchase" disabled={!available || phase === "preparing"} onClick={() => void purchase()} type="button">
            {phase === "preparing" ? "Waiting for wallet approval…" : available ? "Buy with USDC" : "On-chain payments unavailable"}
          </button>
          <p className="chainDisclosure">{available ? "Your wallet signs the transaction. The voucher activates only after USDC reaches escrow and the chain confirms it." : "This offer is not connected to the chain or payment setup is incomplete. No USDC will be charged."}</p>
        </div>
      </section>
      <section className="dashboardShell detailInfoGrid">
        <article><p className="eyebrow">REDEMPTION</p><h2>How it works</h2><ol><li>Connect your wallet and buy the voucher.</li><li>Show its single-use QR code at the business.</li><li>You and the merchant approve redemption with your wallets.</li></ol></article>
        <article><p className="eyebrow">TERMS</p><h2>Voucher details</h2><dl><div><dt>Expires</dt><dd>{campaign.expiresAt}</dd></div><div><dt>Limit</dt><dd>1 per wallet</dd></div><div><dt>Network</dt><dd>Solana Devnet</dd></div></dl></article>
      </section>
      {shareOpen ? <ShareDialog title={campaign.title} url={shareUrl} onClose={() => setShareOpen(false)} /> : null}
    </main>
  );
}
