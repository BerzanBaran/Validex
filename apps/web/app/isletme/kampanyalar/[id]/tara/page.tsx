"use client";

import { BrowserQRCodeReader } from "@zxing/browser";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { DashboardHeader } from "../../../../../components/DashboardHeader";
import { StatusBadge } from "../../../../../components/ui/StatusBadge";
import { useMarketplace } from "../../../../../lib/marketplace";
import { decodeVoucherPass } from "../../../../../lib/voucherQr";
import { chainConfigured, prepareRedemptionHandoff } from "../../../../../lib/validexChain";

type ScanResult = { tone: "success" | "danger"; title: string; detail: string };

export default function VoucherScannerPage() {
  const { id } = useParams<{ id: string }>();
  const marketplace = useMarketplace();
  const campaign = useMemo(() => marketplace.campaigns.find((item) => item.id === id), [id, marketplace.campaigns]);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop(): void } | null>(null);
  const workingRef = useRef(false);
  const [handoff, setHandoff] = useState("");

  useEffect(() => () => controlsRef.current?.stop(), []);

  async function handleRawValue(raw: string) {
    if (workingRef.current) return;
    workingRef.current = true;
    try {
      const pass = decodeVoucherPass(raw);
      if (!walletAddress || !authorized) throw new Error("Kampanyanın işletme cüzdanını bağlayın.");
      if (!chainConfigured() || !campaign?.chainCampaign || !pass.chainVoucher || pass.campaignId !== id) {
        throw new Error("Bu kupon zincir ödemesine bağlı değil; gerçek kullanıma açılamaz.");
      }
      const signed = await prepareRedemptionHandoff(pass.chainVoucher, pass.ownerWallet, walletAddress, campaign.chainCampaign);
      setHandoff(signed);
      setResult({ tone: "success", title: "İşletme imzaladı", detail: "Aşağıdaki işlem metnini müşteriye iletin. Müşteri kendi cüzdanıyla onaylayınca USDC ödemesi tamamlanır." });
      controlsRef.current?.stop();
      setScanning(false);
    } catch (error) {
      setResult({ tone: "danger", title: "Geçersiz QR", detail: error instanceof Error ? error.message : "QR okunamadı." });
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
      setResult({ tone: "danger", title: "Kamera açılamadı", detail: "Kamera iznini kontrol edin veya aşağıdaki yedek kod alanını kullanın." });
    }
  }

  function submitManual(event: FormEvent) {
    event.preventDefault();
    void handleRawValue(manualCode.trim());
  }

  if (!marketplace.ready) return <main className="dashboardPage"><div className="pageState">Tarayıcı hazırlanıyor…</div></main>;
  if (!campaign) return <main className="dashboardPage"><div className="pageState"><h1>Kampanya bulunamadı</h1><Link href="/isletme">İşletme paneline dön</Link></div></main>;
  const authorized = walletAddress === campaign.ownerWallet;

  return (
    <main className="dashboardPage scannerPage">
      <DashboardHeader role="merchant" onAddressChange={setWalletAddress} />
      <div className="dashboardShell breadcrumb"><Link href={`/isletme/kampanyalar/${campaign.id}`}>← Kampanya yönetimi</Link><span>/</span><span>QR doğrulama</span></div>
      <section className="dashboardShell scannerHeader"><div><p className="eyebrow">KUPON DOĞRULAMA</p><h1>QR kodunu tara.</h1><p>{campaign.title} kampanyasına ait kuponları güvenli biçimde doğrulayın.</p></div><StatusBadge tone={authorized ? "success" : "warning"}>{authorized ? "YETKİLİ CÜZDAN" : "CÜZDAN BEKLENİYOR"}</StatusBadge></section>
      <section className="dashboardShell scannerGrid">
        <article className="cameraCard">
          <div className={`cameraViewport ${scanning ? "active" : ""}`}><video ref={videoRef} muted playsInline /><div className="scanFrame"><i /><i /><i /><i /></div>{!scanning ? <div className="cameraPlaceholder"><span>⌗</span><p>Kamera henüz açık değil</p></div> : null}</div>
          {!scanning ? <button className="actionButton" disabled={!authorized || !chainConfigured()} onClick={() => void startScanner()} type="button">Kamerayı aç</button> : <button className="secondaryButton wide" onClick={() => { controlsRef.current?.stop(); setScanning(false); }} type="button">Taramayı durdur</button>}
          <small>Kamera yalnızca QR kodunu okumak için cihazınızda çalışır; görüntü kaydedilmez.</small>
        </article>
        <aside className="scannerAside">
          {result ? <div className={`scanResult ${result.tone}`}><span>{result.tone === "success" ? "✓" : "!"}</span><div><strong>{result.title}</strong><p>{result.detail}</p></div></div> : <div className="scanInstructions"><p className="eyebrow">HAZIR</p><h2>Müşterinin kuponunu isteyin.</h2><p>QR çerçeveye girdiğinde otomatik okunur ve tekrar kullanım kontrolü yapılır.</p></div>}
          <div className="manualDivider"><span>veya QR içeriği</span></div>
          <form className="manualCodeForm" onSubmit={submitManual}><label>Kupon QR verisi<textarea value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Kupon QR içeriğini yapıştırın" required /></label><button className="secondaryButton wide" disabled={!authorized || !chainConfigured()} type="submit">İşletme olarak imzala</button></form>
          {handoff ? <div className="manualCodeForm"><label>Müşteriye iletilecek imzalı işlem<textarea readOnly value={handoff} /></label><button className="secondaryButton wide" onClick={() => void navigator.clipboard.writeText(handoff)} type="button">İşlemi kopyala</button><small>Bu işlem henüz kuponu kullanmaz; müşteri imzası ve zincir onayı gerekir.</small></div> : null}
        </aside>
      </section>
    </main>
  );
}
