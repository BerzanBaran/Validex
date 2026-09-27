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
        setMessage("Kupon kaydı yenilendi. Hâlâ bekliyorsa tekrar ödeme göndermeden önce zincir işlemini kontrol edin.");
        return;
      }
      if (!voucher.chainVoucher) throw new Error("Kuponun zincir adresi API'de bulunamadı.");
      const config = await loadChain();
      const status = await readVoucherStatus(config, new PublicKey(voucher.chainVoucher));
      if (status === "redeemed" && voucher.status !== "redeemed") {
        const signature = (await config.connection.getSignaturesForAddress(new PublicKey(voucher.chainVoucher), { limit: 1 }))[0]?.signature;
        if (!signature) throw new Error("Kupon kullanımı bulundu ancak imza okunamadı.");
        await confirmVoucherRedemption(voucher.id, walletAddress!, voucher.chainVoucher, signature);
        await marketplace.syncMyVouchers(walletAddress);
      }
      if (status === "refunded" && voucher.status !== "refunded") {
        const signature = (await config.connection.getSignaturesForAddress(new PublicKey(voucher.chainVoucher), { limit: 1 }))[0]?.signature;
        if (!signature) throw new Error("İade bulundu ancak işlem imzası okunamadı.");
        await confirmVoucherRefund(voucher.id, walletAddress!, voucher.chainVoucher, signature);
        await marketplace.syncMyVouchers(walletAddress);
      }
      setMessage(status === "missing" ? "Zincirde henüz kupon bulunamadı. İşlem durumunu kontrol edin; yeniden ödeme yapmayın." : `Zincir durumu: ${status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Zincir durumu alınamadı.");
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
      setMessage(`Kupon zincirde kullanıldı. İşlem: ${signature}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kupon kullanımı tamamlanamadı.");
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
      if (await readVoucherStatus(config, voucherPda) !== "refunded") throw new Error("İade zincirde henüz doğrulanamadı; tekrar göndermeyin.");
      await confirmVoucherRefund(voucher.id, walletAddress, voucher.chainVoucher, signature);
      await marketplace.syncMyVouchers(walletAddress);
      setMessage(`USDC iadesi zincirde onaylandı. İşlem: ${signature}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "İade tamamlanamadı.");
    } finally { setBusy(false); }
  }

  if (!voucher) return <main className="dashboardPage"><DashboardHeader role="customer" onAddressChange={setWalletAddress} /><div className="pageState">{!walletAddress ? "Kuponu görmek için cüzdanınızı bağlayın." : marketplace.vouchersLoading ? "Kupon API'den yükleniyor…" : marketplace.voucherError ? marketplace.voucherError : "Kupon bulunamadı."} <Link href="/musteri">Müşteri paneline dön</Link></div></main>;
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
          <div className="voucherPassHeader"><div><p className="eyebrow">VALIDEX PASS</p><h1>{voucher.title}</h1><p>{voucher.merchant}</p></div><StatusBadge tone={action === "redeem" ? "success" : "neutral"}>{voucher.status === "pending" ? "ZİNCİR BEKLENİYOR" : action === "refund" ? "İADE TALEP EDİLEBİLİR" : action === "redeem" ? "AKTİF" : voucher.status === "refunded" ? "İADE EDİLDİ" : voucher.status === "redeemed" ? "KULLANILDI" : "KAPALI"}</StatusBadge></div>
          <div className="perforation" />
          <div className="qrStage">
            {belongsToWallet && action === "redeem" && qrUrl ? <img src={qrUrl} alt="Tek kullanımlık Validex kupon QR kodu" /> : <div className="qrLocked">{voucher.status === "pending" ? "Zincir onayı bekleniyor" : action === "refund" ? "Kupon kullanıma kapalı; USDC iadesi talep edilebilir" : voucher.status === "redeemed" ? "Kupon kullanıldı" : voucher.status === "refunded" ? "İade edildi" : voucher.status === "expired" || voucher.status === "failed" ? "Kupon kapalı" : walletAddress ? "Cüzdan eşleşmedi" : "Cüzdan bağlantısı gerekli"}</div>}
            <small>İşletme görevlisine bu ekranı gösterin</small>
          </div>
          <div className="voucherPassCode"><span>KUPON REFERANSI</span><strong>{belongsToWallet ? voucher.code : "••••••••••••"}</strong></div>
        </article>
        <aside className="voucherAside">
          <p className="eyebrow">KUPON DETAYI</p><h2>{action === "refund" ? "İade hakkınız var." : action === "redeem" ? "Kullanıma hazır." : "Kupon durumu"}</h2>
          <p>{action === "refund" ? "Kampanya iptal edildiği veya kullanım süresi dolduğu için kullanılmamış kuponun USDC tutarını cüzdanınızla escrow'dan geri isteyebilirsiniz. İade otomatik gönderilmez." : "İşletme QR ile kuponu bulup işlemi imzalar; USDC ödemesi ancak sizin ikinci cüzdan imzanızla tamamlanır."}</p>
          <dl><div><dt>Satın alma</dt><dd>{voucher.purchasedAt ? new Date(voucher.purchasedAt).toLocaleDateString("tr-TR") : "Zincir onayı bekleniyor"}</dd></div><div><dt>Son kullanım</dt><dd>{voucher.expiresAt}</dd></div><div><dt>Ödenen</dt><dd>{voucher.priceUsdc} USDC</dd></div><div><dt>Ağ</dt><dd>Solana Devnet</dd></div></dl>
          <button className="secondaryButton wide" onClick={() => setShareOpen(true)} type="button">Kupon bağlantısını paylaş</button>
          {belongsToWallet && chainConfigured() ? <div className="manualCodeForm"><button className="secondaryButton wide" disabled={busy} onClick={() => void checkChainStatus()} type="button">Zincir durumunu kontrol et</button>{action === "redeem" ? <><label>İşletmenin imzaladığı işlem metni<textarea value={handoff} onChange={(event) => setHandoff(event.target.value)} placeholder="İşletmeden gelen imzalı işlemi buraya yapıştırın" /></label><button className="actionButton" disabled={busy || !handoff.trim()} onClick={() => void approveRedemption()} type="button">Kupon kullanımını cüzdanımla onayla</button></> : null}{action === "refund" ? <button className="secondaryButton wide" disabled={busy} onClick={() => void requestRefund()} type="button">Escrow'dan USDC iadesi talep et</button> : null}{message ? <p role="status">{message}</p> : null}</div> : null}
          <Link className="textLink" href={`/kampanyalar/${voucher.campaignId}`}>Kampanyayı görüntüle →</Link>
        </aside>
      </section>
      {shareOpen ? <ShareDialog title={voucher.title} url={shareUrl} onClose={() => setShareOpen(false)} /> : null}
    </main>
  );
}
