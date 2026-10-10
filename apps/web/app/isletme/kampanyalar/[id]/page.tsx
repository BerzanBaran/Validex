"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DashboardHeader } from "../../../../components/DashboardHeader";
import { CapacityMeter } from "../../../../components/ui/CapacityMeter";
import { ShareDialog } from "../../../../components/ui/ShareDialog";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { useMarketplace } from "../../../../lib/marketplace";
import { campaignCancelled, cancelCampaignInstruction, chainConfigured, loadChain, sendWalletTransaction } from "../../../../lib/validexChain";
import { confirmCampaignCancellation } from "../../../../lib/campaignApi";
import { getTransactionStatus } from "../../../../lib/transactionApi";

export default function MerchantCampaignPage() {
  const { id } = useParams<{ id: string }>();
  const marketplace = useMarketplace();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingSignature, setPendingSignature] = useState("");
  const campaign = useMemo(() => marketplace.campaigns.find((item) => item.id === id), [id, marketplace.campaigns]);

  useEffect(() => {
    setPendingSignature(window.localStorage.getItem(`validex:cancel:${id}`) ?? "");
  }, [id]);

  if (!marketplace.ready) return <main className="dashboardPage"><div className="pageState">Loading offer…</div></main>;
  if (!campaign) return <main className="dashboardPage"><div className="pageState"><h1>Offer not found</h1><Link href="/isletme">Back to merchant dashboard</Link></div></main>;

  const authorized = walletAddress === campaign.ownerWallet;
  const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}/kampanyalar/${campaign.id}`;

  async function cancelCampaign() {
    if (!walletAddress || !campaign?.chainCampaign || !window.confirm("This offer will be permanently cancelled. Owners of unused vouchers may request a USDC refund. Continue?")) return;
    try {
      setBusy(true);
      const config = await loadChain();
      const { instruction, campaign: address } = await cancelCampaignInstruction(config, walletAddress, campaign.chainCampaign);
      const signature = await sendWalletTransaction(config, walletAddress, instruction, address, (submitted) => {
        window.localStorage.setItem(`validex:cancel:${id}`, submitted);
        setPendingSignature(submitted);
      });
      if (!await campaignCancelled(config, address)) throw new Error("Cancellation is not yet confirmed on-chain; do not submit it again.");
      const updated = await confirmCampaignCancellation(campaign.id, walletAddress, signature);
      marketplace.saveCampaign(updated);
      window.localStorage.removeItem(`validex:cancel:${id}`);
      setPendingSignature("");
      setNotice("Offer cancelled on-chain. Owners of active vouchers may request a refund.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Offer cancellation could not be completed.");
    } finally { setBusy(false); }
  }

  async function retryCancellationConfirmation() {
    if (!walletAddress || !campaign || !pendingSignature) return;
    try {
      setBusy(true);
      const status = await getTransactionStatus(pendingSignature, walletAddress);
      if (status === "failed") {
        window.localStorage.removeItem(`validex:cancel:${id}`);
        setPendingSignature("");
        setNotice("The previous cancellation failed on-chain. You may try again.");
        return;
      }
      if (status !== "finalized") {
        setNotice("Cancellation is not finalized yet. Do not submit the same action again.");
        return;
      }
      const updated = await confirmCampaignCancellation(campaign.id, walletAddress, pendingSignature);
      marketplace.saveCampaign(updated);
      window.localStorage.removeItem(`validex:cancel:${id}`);
      setPendingSignature("");
      setNotice("On-chain cancellation is now synced with the API. Voucher owners may request refunds.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not sync the cancellation record.");
    } finally { setBusy(false); }
  }

  return (
    <main className="dashboardPage merchantCampaignPage">
      <DashboardHeader role="merchant" onAddressChange={setWalletAddress} />
      <div className="dashboardShell breadcrumb"><Link href="/isletme">← My offers</Link><span>/</span><span>Manage</span></div>
      {!walletAddress ? <div className="dashboardShell notice">Connect your merchant wallet to manage this offer.</div> : null}
      {walletAddress && !authorized ? <div className="dashboardShell notice errorNotice">This offer was not created by the connected wallet.</div> : null}
      {notice ? <div className="dashboardShell notice" role="status">{notice}</div> : null}
      <section className="dashboardShell managementHero">
        <div><StatusBadge tone={campaign.status === "published" ? "success" : "warning"}>{campaign.status === "published" ? "LIVE" : campaign.status === "cancelled" ? "CANCELLED" : "CLOSED"}</StatusBadge><p className="eyebrow">{campaign.merchant} · {campaign.area}</p><h1>{campaign.title}</h1><p>{campaign.description}</p></div>
        <div className="managementActions"><button className="secondaryButton" disabled={!authorized} onClick={() => setShareOpen(true)}>Share ↗</button><Link className={`actionLink ${!authorized ? "disabled" : ""}`} href={authorized ? `/isletme/kampanyalar/${campaign.id}/tara` : "#"}>Open QR scanner</Link></div>
      </section>
      <section className="dashboardShell metricGrid managementMetrics">
        <div><span>Vouchers sold</span><strong>{campaign.sold}</strong><small>{campaign.stock} total stock</small></div>
        <div><span>Stock remaining</span><strong>{Math.max(0, campaign.stock - campaign.sold)}</strong><small>Sales are read from the API</small></div>
        <div><span>Gross sales (including escrow)</span><strong>{(campaign.sold * campaign.priceUsdc).toFixed(2)} USDC</strong><small>Merchant payout happens only on redemption</small></div>
      </section>
      <section className="dashboardShell managementGrid">
        <article className="managementCard"><div className="cardHeading"><div><p className="eyebrow">CAPACITY</p><h2>Sales progress</h2></div><span>{Math.round((campaign.sold / campaign.stock) * 100)}%</span></div><CapacityMeter sold={campaign.sold} stock={campaign.stock} /><button className="secondaryButton wide" disabled={!authorized || !chainConfigured() || !campaign.chainCampaign || campaign.status !== "published" || busy || !!pendingSignature} onClick={() => void cancelCampaign()} type="button">{busy ? "Waiting for on-chain confirmation…" : campaign.status === "published" ? "Cancel offer on-chain" : "Offer closed"}</button>{pendingSignature && authorized ? <div className="manualCodeForm"><p>Cancellation submitted: {pendingSignature}. Sync the API record before sending another transaction.</p><button className="secondaryButton wide" disabled={busy} onClick={() => void retryCancellationConfirmation()} type="button">Verify cancellation again</button></div> : null}</article>
        <article className="managementCard"><div className="cardHeading"><div><p className="eyebrow">VOUCHERS</p><h2>Sales details</h2></div></div><p>Verified voucher sales and remaining stock come from current API records. Customer vouchers are not stored in the merchant scanner.</p></article>
      </section>
      {shareOpen ? <ShareDialog title={campaign.title} url={shareUrl} onClose={() => setShareOpen(false)} /> : null}
    </main>
  );
}
