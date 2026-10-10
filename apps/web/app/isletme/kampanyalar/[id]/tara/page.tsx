"use client";

import { BrowserQRCodeReader } from "@zxing/browser";
import Link from "next/link";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { DashboardHeader } from "../../../../../components/DashboardHeader";
import { StatusBadge } from "../../../../../components/ui/StatusBadge";
import { useMarketplace } from "../../../../../lib/marketplace";
import { getCampaignScanRole, verifyVoucherQr } from "../../../../../lib/merchantApi";
import { decodeVoucherPass } from "../../../../../lib/voucherQr";
import { chainConfigured, prepareRedemptionHandoff } from "../../../../../lib/validexChain";

type ScanResult = { tone: "success" | "danger"; title: string; detail: string };

export default function VoucherScannerPage() {
  const { id } = useParams<{ id: string }>();
  const marketplace = useMarketplace();
  const campaign = useMemo(() => marketplace.campaigns.find((item) => item.id === id), [id, marketplace.campaigns]);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [scanRole, setScanRole] = useState<"owner" | "staff" | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop(): void } | null>(null);
  const workingRef = useRef(false);
  const [handoff, setHandoff] = useState("");
  const [handoffUrl, setHandoffUrl] = useState("");
  const [handoffQrUrl, setHandoffQrUrl] = useState("");

  useEffect(() => () => controlsRef.current?.stop(), []);

  useEffect(() => {
    setScanRole(null);
    if (!walletAddress || !campaign) return;
    let active = true;
    getCampaignScanRole(walletAddress, campaign.id)
      .then((role) => { if (active) setScanRole(role); })
      .catch(() => { if (active) setScanRole(null); });
    return () => { active = false; };
  }, [walletAddress, campaign?.id]);

  async function handleRawValue(raw: string) {
    if (workingRef.current) return;
    workingRef.current = true;
    try {
      const pass = decodeVoucherPass(raw);
      if (!walletAddress || !authorized) throw new Error("Connect an authorized wallet for this offer.");
      if (!chainConfigured() || !campaign?.chainCampaign || !pass.chainVoucher || pass.campaignId !== id) {
        throw new Error("This voucher is not linked to an on-chain payment and cannot be redeemed.");
      }
      const verified = await verifyVoucherQr(walletAddress, pass);
      if (scanRole === "owner" && verified.can_prepare_redemption) {
        const signed = await prepareRedemptionHandoff(verified.chain_voucher, verified.owner_wallet, walletAddress, campaign.chainCampaign);
        const approvalUrl = new URL(`/musteri/kuponlar/${verified.voucher_id}`, window.location.origin);
        approvalUrl.searchParams.set("handoff", signed);
        setHandoff(signed);
        setHandoffUrl(approvalUrl.toString());
        setHandoffQrUrl(await QRCode.toDataURL(approvalUrl.toString(), {
          width: 320, margin: 2, errorCorrectionLevel: "L",
          color: { dark: "#17251e", light: "#ffffff" },
        }));
        setResult({ tone: "success", title: "QR verified and merchant signed", detail: "Ask the customer to scan the approval QR. The USDC payout completes only after they approve it in their wallet." });
      } else {
        setHandoff("");
        setHandoffUrl("");
        setHandoffQrUrl("");
        setResult({ tone: "success", title: "QR verified", detail: "The API and on-chain voucher are valid. The business owner must still sign redemption and payout." });
      }
      controlsRef.current?.stop();
      setScanning(false);
    } catch (error) {
      setResult({ tone: "danger", title: "Invalid QR code", detail: error instanceof Error ? error.message : "Could not read the QR code." });
    } finally {
      workingRef.current = false;
    }
  }

  async function startScanner() {
    if (!videoRef.current) return;
    setResult(null);
    setScanning(true);
    try {
      const reader = new BrowserQRCodeReader();
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, (scan) => {
        if (scan) void handleRawValue(scan.getText());
      });
    } catch {
      setScanning(false);
      setResult({ tone: "danger", title: "Could not open camera", detail: "Check camera permission or use the manual QR field below." });
    }
  }

  function submitManual(event: FormEvent) {
    event.preventDefault();
    void handleRawValue(manualCode.trim());
  }

  if (!marketplace.ready) return <main className="dashboardPage"><div className="pageState">Preparing scanner…</div></main>;
  if (!campaign) return <main className="dashboardPage"><div className="pageState"><h1>Offer not found</h1><Link href="/isletme">Back to merchant dashboard</Link></div></main>;
  const authorized = scanRole !== null;

  return (
    <main className="dashboardPage scannerPage">
      <DashboardHeader role="merchant" onAddressChange={setWalletAddress} />
      <div className="dashboardShell breadcrumb"><Link href={`/isletme/kampanyalar/${campaign.id}`}>← Manage offer</Link><span>/</span><span>QR verification</span></div>
      <section className="dashboardShell scannerHeader"><div><p className="eyebrow">VOUCHER VERIFICATION</p><h1>Scan the QR code.</h1><p>Verify vouchers for {campaign.title} through the API and Solana.</p></div><StatusBadge tone={authorized ? "success" : "warning"}>{scanRole === "owner" ? "BUSINESS OWNER" : scanRole === "staff" ? "QR STAFF" : "AUTHORIZED WALLET REQUIRED"}</StatusBadge></section>
      <section className="dashboardShell scannerGrid">
        <article className="cameraCard">
          <div className={`cameraViewport ${scanning ? "active" : ""}`}><video ref={videoRef} muted playsInline /><div className="scanFrame"><i /><i /><i /><i /></div>{!scanning ? <div className="cameraPlaceholder"><span>⌗</span><p>Camera is off</p></div> : null}</div>
          {!scanning ? <button className="actionButton" disabled={!authorized || !chainConfigured()} onClick={() => void startScanner()} type="button">Open camera</button> : <button className="secondaryButton wide" onClick={() => { controlsRef.current?.stop(); setScanning(false); }} type="button">Stop scanning</button>}
          <small>The camera runs on your device to read the QR code. Video is not recorded.</small>
        </article>
        <aside className="scannerAside">
          {result ? <div className={`scanResult ${result.tone}`}><span>{result.tone === "success" ? "✓" : "!"}</span><div><strong>{result.title}</strong><p>{result.detail}</p></div></div> : <div className="scanInstructions"><p className="eyebrow">READY</p><h2>Ask for the customer's voucher.</h2><p>The QR code scans automatically in the frame and is checked against prior use.</p></div>}
          <div className="manualDivider"><span>or QR payload</span></div>
          <form className="manualCodeForm" onSubmit={submitManual}><label>Voucher QR data<textarea value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Paste the voucher QR payload" required /></label><button className="secondaryButton wide" disabled={!authorized || !chainConfigured()} type="submit">Verify QR</button></form>
          {handoff ? <div className="manualCodeForm handoffCard"><p className="eyebrow">CUSTOMER APPROVAL</p>{handoffQrUrl ? <img className="handoffQr" src={handoffQrUrl} alt="QR code that opens the customer redemption approval" /> : null}<p>Let the customer scan this QR with their phone. It opens their voucher and loads the merchant-signed transaction.</p><button className="secondaryButton wide" onClick={() => void navigator.clipboard.writeText(handoffUrl)} type="button">Copy approval link</button><details><summary>Manual fallback</summary><label>Signed transaction<textarea readOnly value={handoff} /></label><button className="secondaryButton wide" onClick={() => void navigator.clipboard.writeText(handoff)} type="button">Copy transaction</button></details><small>This does not redeem the voucher yet; the customer's signature and chain confirmation are still required.</small></div> : null}
        </aside>
      </section>
    </main>
  );
}
