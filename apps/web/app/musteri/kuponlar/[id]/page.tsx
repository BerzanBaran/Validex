"use client";

import QRCode from "qrcode";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";

import { DashboardHeader } from "../../../../components/DashboardHeader";
import { ShareDialog } from "../../../../components/ui/ShareDialog";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { useMarketplace } from "../../../../lib/marketplace";
import { encodeVoucherPass } from "../../../../lib/voucherQr";
import { chainConfigured, confirmRedemptionHandoff, loadChain, readVoucherStatus, refundInstruction, sendWalletTransaction } from "../../../../lib/validexChain";
import { confirmVoucherRedemption, confirmVoucherRefund } from "../../../../lib/voucherApi";
import { voucherAction } from "../../../../lib/voucherPolicy";

export default function VoucherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const marketplace = useMarketplace();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [handoff, setHandoff] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const voucher = useMemo(() => marketplace.vouchers.find((item) => item.id === id), [id, marketplace.vouchers]);
  const action = voucher ? voucherAction(voucher, now) : "none";
  const payload = action === "redeem" && voucher ? encodeVoucherPass(voucher) : "";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const incoming = new URLSearchParams(window.location.search).get("handoff");
    if (!incoming || incoming.length > 4096) return;
    setHandoff(incoming);
    setMessage("Merchant signature received. Review and approve the redemption with your wallet.");
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (!payload) return;
    QRCode.toDataURL(payload, { width: 420, margin: 2, color: { dark: "#17251e", light: "#ffffff" }, errorCorrectionLevel: "M" })
      .then(setQrUrl)
      .catch(() => setQrUrl(""));
  }, [payload]);

  useEffect(() => {
    if (walletAddress) void marketplace.syncMyVouchers(walletAddress).catch(() => {});
    else marketplace.clearVouchers();
  }, [walletAddress, marketplace.syncMyVouchers, marketplace.clearVouchers]);

  async function checkChainStatus() {
    if (!voucher || !walletAddress) return;
    try {
      setBusy(true);
      if (voucher.status === "pending") {
        await marketplace.syncMyVouchers(walletAddress);
        setMessage("Voucher refreshed. If it is still pending, check the on-chain transaction before paying again.");
        return;
      }
      if (!voucher.chainVoucher) throw new Error("The voucher's on-chain address was not found in the API.");
      const config = await loadChain();
      const status = await readVoucherStatus(config, new PublicKey(voucher.chainVoucher));
      if (status === "redeemed" && voucher.status !== "redeemed") {
        const signature = (await config.connection.getSignaturesForAddress(new PublicKey(voucher.chainVoucher), { limit: 1 }))[0]?.signature;
        if (!signature) throw new Error("Redemption was found, but its transaction signature could not be read.");
        await confirmVoucherRedemption(voucher.id, walletAddress!, voucher.chainVoucher, signature);
        await marketplace.syncMyVouchers(walletAddress);
      }
      if (status === "refunded" && voucher.status !== "refunded") {
        const signature = (await config.connection.getSignaturesForAddress(new PublicKey(voucher.chainVoucher), { limit: 1 }))[0]?.signature;
        if (!signature) throw new Error("Refund was found, but its transaction signature could not be read.");
        await confirmVoucherRefund(voucher.id, walletAddress!, voucher.chainVoucher, signature);
        await marketplace.syncMyVouchers(walletAddress);
      }
      setMessage(status === "missing" ? "Voucher not found on-chain yet. Check the transaction before paying again." : `On-chain status: ${status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read the on-chain status.");
    } finally { setBusy(false); }
  }

  async function approveRedemption() {
    if (!voucher?.chainVoucher || !walletAddress || walletAddress !== voucher.ownerWallet || action !== "redeem") return;
    try {
      setBusy(true);
      setMessage(null);
      const signature = await confirmRedemptionHandoff(handoff.trim(), voucher.chainVoucher, walletAddress);
      await confirmVoucherRedemption(voucher.id, walletAddress, voucher.chainVoucher, signature);
      await marketplace.syncMyVouchers(walletAddress);
      setHandoff("");
      setMessage(`Voucher redeemed on-chain. Transaction: ${signature}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Voucher redemption could not be completed.");
    } finally { setBusy(false); }
  }

  async function requestRefund() {
    if (!voucher?.chainVoucher || !walletAddress || walletAddress !== voucher.ownerWallet || action !== "refund") return;
    try {
      setBusy(true);
      setMessage(null);
      const config = await loadChain();
      const { instruction, voucher: voucherPda } = await refundInstruction(config, voucher.chainVoucher, walletAddress);
      const signature = await sendWalletTransaction(config, walletAddress, instruction, voucherPda);
      if (await readVoucherStatus(config, voucherPda) !== "refunded") throw new Error("The refund is not yet verified on-chain; do not submit it again.");
      await confirmVoucherRefund(voucher.id, walletAddress, voucher.chainVoucher, signature);
      await marketplace.syncMyVouchers(walletAddress);
      setMessage(`USDC refund confirmed on-chain. Transaction: ${signature}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refund could not be completed.");
    } finally { setBusy(false); }
  }

  if (!voucher) return <main className="dashboardPage"><DashboardHeader role="customer" onAddressChange={setWalletAddress} /><div className="pageState">{!walletAddress ? "Connect your wallet to view this voucher." : marketplace.vouchersLoading ? "Loading voucher…" : marketplace.voucherError ? marketplace.voucherError : "Voucher not found."} <Link href="/musteri">Back to customer dashboard</Link></div></main>;
  const belongsToWallet = walletAddress === voucher.ownerWallet;
  const shareUrl = typeof window === "undefined" ? "" : window.location.href;

  return (
    <main className="dashboardPage voucherDetailPage">
      <DashboardHeader role="customer" onAddressChange={setWalletAddress} />
      <div className="dashboardShell breadcrumb"><Link href="/musteri">← My vouchers</Link><span>/</span><span>{voucher.merchant}</span></div>
      {!walletAddress ? <div className="dashboardShell notice">Connect your wallet to view the voucher QR code.</div> : null}
      {walletAddress && !belongsToWallet ? <div className="dashboardShell notice errorNotice">This voucher does not belong to the connected wallet.</div> : null}
      <section className="dashboardShell voucherPassLayout">
        <article className="voucherPass">
          <div className="voucherPassHeader"><div><p className="eyebrow">VALIDEX PASS</p><h1>{voucher.title}</h1><p>{voucher.merchant}</p></div><StatusBadge tone={action === "redeem" ? "success" : "neutral"}>{voucher.status === "pending" ? "PENDING ON-CHAIN" : action === "refund" ? "REFUND AVAILABLE" : action === "redeem" ? "ACTIVE" : voucher.status === "refunded" ? "REFUNDED" : voucher.status === "redeemed" ? "REDEEMED" : "CLOSED"}</StatusBadge></div>
          <div className="perforation" />
          <div className="qrStage">
            {belongsToWallet && action === "redeem" && qrUrl ? <img src={qrUrl} alt="Single-use Validex voucher QR code" /> : <div className="qrLocked">{voucher.status === "pending" ? "Waiting for on-chain confirmation" : action === "refund" ? "Voucher closed; USDC refund available" : voucher.status === "redeemed" ? "Voucher redeemed" : voucher.status === "refunded" ? "Refunded" : voucher.status === "expired" || voucher.status === "failed" ? "Voucher closed" : walletAddress ? "Wrong wallet" : "Connect your wallet"}</div>}
            <small>Show this screen to the merchant</small>
          </div>
          <div className="voucherPassCode"><span>VOUCHER REFERENCE</span><strong>{belongsToWallet ? voucher.code : "••••••••••••"}</strong></div>
        </article>
        <aside className="voucherAside">
          <p className="eyebrow">VOUCHER DETAILS</p><h2>{action === "refund" ? "Your refund is ready." : action === "redeem" ? "Ready to redeem." : "Voucher status"}</h2>
          <p>{action === "refund" ? "This offer was cancelled or expired. You can request the full USDC amount back from escrow with your wallet. Refunds are not sent automatically." : "The merchant scans the QR and signs the transaction. USDC is released only after you add your wallet signature."}</p>
          <dl><div><dt>Purchased</dt><dd>{voucher.purchasedAt ? new Date(voucher.purchasedAt).toLocaleDateString("en-US") : "Pending on-chain"}</dd></div><div><dt>Expires</dt><dd>{voucher.expiresAt}</dd></div><div><dt>Paid</dt><dd>{voucher.priceUsdc} USDC</dd></div><div><dt>Network</dt><dd>Solana Devnet</dd></div></dl>
          <button className="secondaryButton wide" onClick={() => setShareOpen(true)} type="button">Share voucher link</button>
          {belongsToWallet && chainConfigured() ? <div className="manualCodeForm"><button className="secondaryButton wide" disabled={busy} onClick={() => void checkChainStatus()} type="button">Check on-chain status</button>{action === "redeem" ? <><label>Transaction signed by the merchant<textarea value={handoff} onChange={(event) => setHandoff(event.target.value)} placeholder="Paste the merchant-signed transaction here" /></label><button className="actionButton" disabled={busy || !handoff.trim()} onClick={() => void approveRedemption()} type="button">Approve redemption with my wallet</button></> : null}{action === "refund" ? <button className="secondaryButton wide" disabled={busy} onClick={() => void requestRefund()} type="button">Request USDC refund from escrow</button> : null}{message ? <p role="status">{message}</p> : null}</div> : null}
          <Link className="textLink" href={`/kampanyalar/${voucher.campaignId}`}>View offer →</Link>
        </aside>
      </section>
      {shareOpen ? <ShareDialog title={voucher.title} url={shareUrl} onClose={() => setShareOpen(false)} /> : null}
    </main>
  );
}
