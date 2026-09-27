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
import { confirmVoucherPurchase, confirmVoucherRedemption, confirmVoucherRefund } from "../../../../lib/voucherApi";

export default function VoucherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const marketplace = useMarketplace();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [handoff, setHandoff] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const voucher = useMemo(() => marketplace.vouchers.find((item) => item.id === id), [id, marketplace.vouchers]);
  const payload = voucher?.status === "active" && voucher.chainVoucher ? encodeVoucherPass(voucher) : "";

  useEffect(() => {
    if (!payload) return;
    QRCode.toDataURL(payload, { width: 420, margin: 2, color: { dark: "#17251e", light: "#ffffff" }, errorCorrectionLevel: "M" })
      .then(setQrUrl)
      .catch(() => setQrUrl(""));
  }, [payload]);

  useEffect(() => {
    if (walletAddress && chainConfigured()) void marketplace.syncMyVouchers(walletAddress).catch(() => {});
  }, [walletAddress, marketplace.syncMyVouchers]);

  async function checkChainStatus() {
    if (!voucher?.chainVoucher) return;
    try {
      setBusy(true);
      const config = await loadChain();
      const status = await readVoucherStatus(config, new PublicKey(voucher.chainVoucher));
      if (status === "active" && voucher.status === "pending") {
        const signature = voucher.transactionSignature ?? (await config.connection.getSignaturesForAddress(new PublicKey(voucher.chainVoucher), { limit: 1 }))[0]?.signature;
        if (!signature) throw new Error("Zincir işlemi bulundu ancak imza okunamadı; tekrar ödeme yapmayın.");
        await confirmVoucherPurchase(voucher.id, walletAddress!, voucher.chainVoucher, signature);
        marketplace.confirmPendingVoucher(voucher.id);
      }
      if (status === "redeemed" && voucher.status !== "redeemed") {
        const signature = (await config.connection.getSignaturesForAddress(new PublicKey(voucher.chainVoucher), { limit: 1 }))[0]?.signature;
        if (!signature) throw new Error("Kupon kullanımı bulundu ancak imza okunamadı.");
        await confirmVoucherRedemption(voucher.id, walletAddress!, voucher.chainVoucher, signature);
        marketplace.markRedeemed(voucher.id, signature);
      }
      if (status === "refunded" && voucher.status !== "refunded") {
        const signature = (await config.connection.getSignaturesForAddress(new PublicKey(voucher.chainVoucher), { limit: 1 }))[0]?.signature;
        if (!signature) throw new Error("İade bulundu ancak işlem imzası okunamadı.");
        await confirmVoucherRefund(voucher.id, walletAddress!, voucher.chainVoucher, signature);
        marketplace.markRefunded(voucher.id, signature);
      }
      setMessage(status === "missing" ? "Zincirde henüz kupon bulunamadı. İşlem durumunu kontrol edin; yeniden ödeme yapmayın." : `Zincir durumu: ${status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Zincir durumu alınamadı.");
    } finally { setBusy(false); }
  }

  async function approveRedemption() {
    if (!voucher?.chainVoucher || !walletAddress || walletAddress !== voucher.ownerWallet) return;
    try {
      setBusy(true);
      setMessage(null);
      const signature = await confirmRedemptionHandoff(handoff.trim(), voucher.chainVoucher, walletAddress);
      await confirmVoucherRedemption(voucher.id, walletAddress, voucher.chainVoucher, signature);
      marketplace.markRedeemed(voucher.id, signature);
      setHandoff("");
      setMessage(`Kupon zincirde kullanıldı. İşlem: ${signature}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kupon kullanımı tamamlanamadı.");
    } finally { setBusy(false); }
  }

  async function requestRefund() {
    if (!voucher?.chainVoucher || !walletAddress || walletAddress !== voucher.ownerWallet) return;
    try {
      setBusy(true);
      setMessage(null);
      const config = await loadChain();
      const { instruction, voucher: voucherPda } = await refundInstruction(config, voucher.chainVoucher, walletAddress);
      const signature = await sendWalletTransaction(config, walletAddress, instruction, voucherPda);
      if (await readVoucherStatus(config, voucherPda) !== "refunded") throw new Error("İade zincirde henüz doğrulanamadı; tekrar göndermeyin.");
      await confirmVoucherRefund(voucher.id, walletAddress, voucher.chainVoucher, signature);
      marketplace.markRefunded(voucher.id, signature);
      setMessage(`USDC iadesi zincirde onaylandı. İşlem: ${signature}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "İade tamamlanamadı.");
    } finally { setBusy(false); }
  }

  if (!marketplace.ready) return <main className="dashboardPage"><div className="pageState">Kupon yükleniyor…</div></main>;
  if (!voucher) return <main className="dashboardPage"><div className="pageState"><h1>Kupon bulunamadı</h1><Link href="/musteri">Müşteri paneline dön</Link></div></main>;
  const belongsToWallet = walletAddress === voucher.ownerWallet;
  const shareUrl = typeof window === "undefined" ? "" : window.location.href;

  return (
    <main className="dashboardPage voucherDetailPage">
      <DashboardHeader role="customer" onAddressChange={setWalletAddress} />
      <div className="dashboardShell breadcrumb"><Link href="/musteri">← Kuponlarım</Link><span>/</span><span>{voucher.merchant}</span></div>
      {!walletAddress ? <div className="dashboardShell notice">QR kuponunuzu görmek için cüzdanınızı bağlayın.</div> : null}
      {walletAddress && !belongsToWallet ? <div className="dashboardShell notice errorNotice">Bu kupon bağlı cüzdana ait değil.</div> : null}
      <section className="dashboardShell voucherPassLayout">
        <article className="voucherPass">
          <div className="voucherPassHeader"><div><p className="eyebrow">VALIDEX PASS</p><h1>{voucher.title}</h1><p>{voucher.merchant}</p></div><StatusBadge tone={voucher.status === "active" ? "success" : "neutral"}>{voucher.status === "pending" ? "ZİNCİR BEKLENİYOR" : voucher.status === "active" ? "AKTİF" : voucher.status === "refunded" ? "İADE EDİLDİ" : "KULLANILDI"}</StatusBadge></div>
          <div className="perforation" />
          <div className="qrStage">
            {belongsToWallet && voucher.status === "active" && qrUrl ? <img src={qrUrl} alt="Tek kullanımlık Validex kupon QR kodu" /> : <div className="qrLocked">{voucher.status === "pending" ? "Zincir onayı bekleniyor" : voucher.status === "redeemed" ? "Kupon kullanıldı" : voucher.status === "refunded" ? "İade edildi" : walletAddress ? "Cüzdan eşleşmedi" : "Cüzdan bağlantısı gerekli"}</div>}
            <small>İşletme görevlisine bu ekranı gösterin</small>
          </div>
          <div className="voucherPassCode"><span>KUPON REFERANSI</span><strong>{belongsToWallet ? voucher.code : "••••••••••••"}</strong></div>
        </article>
        <aside className="voucherAside">
          <p className="eyebrow">KUPON DETAYI</p><h2>Kullanıma hazır.</h2>
          <p>İşletme QR ile kuponu bulup işlemi imzalar; USDC ödemesi ancak sizin ikinci cüzdan imzanızla tamamlanır.</p>
          <dl><div><dt>Satın alma</dt><dd>{new Date(voucher.purchasedAt).toLocaleDateString("tr-TR")}</dd></div><div><dt>Son kullanım</dt><dd>{voucher.expiresAt}</dd></div><div><dt>Ödenen</dt><dd>{voucher.priceUsdc} USDC</dd></div><div><dt>Ağ</dt><dd>Solana Devnet</dd></div></dl>
          <button className="secondaryButton wide" onClick={() => setShareOpen(true)} type="button">Kupon bağlantısını paylaş</button>
          {belongsToWallet && voucher.chainVoucher && chainConfigured() ? <div className="manualCodeForm"><button className="secondaryButton wide" disabled={busy} onClick={() => void checkChainStatus()} type="button">Zincir durumunu kontrol et</button>{voucher.status === "active" ? <><label>İşletmenin imzaladığı işlem metni<textarea value={handoff} onChange={(event) => setHandoff(event.target.value)} placeholder="İşletmeden gelen imzalı işlemi buraya yapıştırın" /></label><button className="actionButton" disabled={busy || !handoff.trim()} onClick={() => void approveRedemption()} type="button">Kupon kullanımını cüzdanımla onayla</button><button className="secondaryButton wide" disabled={busy} onClick={() => void requestRefund()} type="button">İptal/süre sonu için USDC iadesi talep et</button></> : null}{message ? <p role="status">{message}</p> : null}</div> : null}
          <Link className="textLink" href={`/kampanyalar/${voucher.campaignId}`}>Kampanyayı görüntüle →</Link>
        </aside>
      </section>
      {shareOpen ? <ShareDialog title={voucher.title} url={shareUrl} onClose={() => setShareOpen(false)} /> : null}
    </main>
  );
}
