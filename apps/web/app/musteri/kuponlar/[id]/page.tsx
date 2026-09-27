"use client";

import QRCode from "qrcode";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DashboardHeader } from "../../../../components/DashboardHeader";
import { ShareDialog } from "../../../../components/ui/ShareDialog";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { useMarketplace } from "../../../../lib/marketplace";
import { encodeVoucherPass } from "../../../../lib/voucherQr";

export default function VoucherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const marketplace = useMarketplace();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const voucher = useMemo(() => marketplace.vouchers.find((item) => item.id === id), [id, marketplace.vouchers]);
  const payload = voucher ? encodeVoucherPass(voucher) : "";

  useEffect(() => {
    if (!payload) return;
    QRCode.toDataURL(payload, { width: 420, margin: 2, color: { dark: "#17251e", light: "#ffffff" }, errorCorrectionLevel: "M" })
      .then(setQrUrl)
      .catch(() => setQrUrl(""));
  }, [payload]);

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
          <div className="voucherPassHeader"><div><p className="eyebrow">VALIDEX PASS</p><h1>{voucher.title}</h1><p>{voucher.merchant}</p></div><StatusBadge tone={voucher.status === "active" ? "success" : "neutral"}>{voucher.status === "active" ? "AKTİF" : "KULLANILDI"}</StatusBadge></div>
          <div className="perforation" />
          <div className="qrStage">
            {belongsToWallet && qrUrl ? <img src={qrUrl} alt="Tek kullanımlık Validex kupon QR kodu" /> : <div className="qrLocked">{walletAddress ? "Cüzdan eşleşmedi" : "Cüzdan bağlantısı gerekli"}</div>}
            <small>İşletme görevlisine bu ekranı gösterin</small>
          </div>
          <div className="voucherPassCode"><span>YEDEK KOD</span><strong>{belongsToWallet ? voucher.code : "••••••••••••"}</strong></div>
        </article>
        <aside className="voucherAside">
          <p className="eyebrow">KUPON DETAYI</p><h2>Kullanıma hazır.</h2>
          <p>QR kodu yalnızca kampanyayı oluşturan işletmenin bağlı cüzdanı doğrulayabilir.</p>
          <dl><div><dt>Satın alma</dt><dd>{new Date(voucher.purchasedAt).toLocaleDateString("tr-TR")}</dd></div><div><dt>Son kullanım</dt><dd>{voucher.expiresAt}</dd></div><div><dt>Ödenen</dt><dd>{voucher.priceUsdc} USDC</dd></div><div><dt>Ağ</dt><dd>Solana Devnet</dd></div></dl>
          <button className="secondaryButton wide" onClick={() => setShareOpen(true)} type="button">Kupon bağlantısını paylaş</button>
          <Link className="textLink" href={`/kampanyalar/${voucher.campaignId}`}>Kampanyayı görüntüle →</Link>
        </aside>
      </section>
      {shareOpen ? <ShareDialog title={voucher.title} url={shareUrl} onClose={() => setShareOpen(false)} /> : null}
    </main>
  );
}
