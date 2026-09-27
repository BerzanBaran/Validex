"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { DashboardHeader } from "../../../components/DashboardHeader";
import { CapacityMeter } from "../../../components/ui/CapacityMeter";
import { ShareDialog } from "../../../components/ui/ShareDialog";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { TransactionFeedback, TransactionPhase } from "../../../components/ui/TransactionFeedback";
import { useMarketplace } from "../../../lib/marketplace";
import { chainConfigured } from "../../../lib/validexChain";

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const marketplace = useMarketplace();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [phase, setPhase] = useState<TransactionPhase>("idle");
  const [message, setMessage] = useState<string>();
  const [shareOpen, setShareOpen] = useState(false);
  const campaign = useMemo(() => marketplace.campaigns.find((item) => item.id === id), [id, marketplace.campaigns]);

  async function purchase() {
    if (!walletAddress) {
      setPhase("failed");
      setMessage("Satın almak için önce Solflare veya Phantom cüzdanınızı bağlayın.");
      return;
    }
    setPhase("preparing");
    setMessage(undefined);
    try {
      const voucher = await marketplace.purchaseCampaign(id, walletAddress);
      setPhase("confirmed");
      window.setTimeout(() => router.push(`/musteri/kuponlar/${voucher.id}`), 650);
    } catch (error) {
      setPhase("failed");
      setMessage(error instanceof Error ? error.message : "Kupon oluşturulamadı.");
    }
  }

  if (!marketplace.ready) return <main className="dashboardPage"><div className="pageState">Kampanya yükleniyor…</div></main>;
  if (!campaign) return <main className="dashboardPage"><div className="pageState"><h1>Kampanya bulunamadı</h1><Link href="/musteri">Kampanyalara dön</Link></div></main>;

  const expired = new Date(campaign.expiresAt).getTime() <= Date.now();
  const soldOut = campaign.sold >= campaign.stock;
  const available = campaign.status === "published" && !expired && !soldOut &&
    chainConfigured() && Boolean(campaign.chainCampaign);
  const discount = Math.round((1 - campaign.priceUsdc / campaign.originalValueUsdc) * 100);
  const shareUrl = typeof window === "undefined" ? "" : window.location.href;

  return (
    <main className="dashboardPage detailPage">
      <DashboardHeader role="customer" onAddressChange={setWalletAddress} />
      <div className="dashboardShell breadcrumb"><Link href="/musteri">← Kampanyalar</Link><span>/</span><span>{campaign.merchant}</span></div>
      <section className="dashboardShell campaignDetailHero">
        <div className={`campaignDetailVisual ${campaign.accent}`}>
          <StatusBadge tone={available ? "success" : "warning"}>{available ? "SATIŞTA" : soldOut ? "TÜKENDİ" : "KAPALI"}</StatusBadge>
          <div><span>Validex yerel fırsat</span><strong>%{discount}</strong><small>avantaj</small></div>
        </div>
        <div className="campaignDetailCopy">
          <div className="detailTopline"><p className="eyebrow">{campaign.merchant} · {campaign.category} · {campaign.area}</p><button className="secondaryButton" onClick={() => setShareOpen(true)}>Paylaş ↗</button></div>
          <h1>{campaign.title}</h1>
          <p className="detailLead">{campaign.description}</p>
          <div className="pricePanel"><div><strong>{campaign.priceUsdc}</strong><span>USDC</span></div><p><s>{campaign.originalValueUsdc} USDC</s><br />Kupon başına fiyat</p></div>
          <CapacityMeter sold={campaign.sold} stock={campaign.stock} />
          <TransactionFeedback phase={phase} message={message} />
          <button className="actionButton detailPurchase" disabled={!available || phase === "preparing"} onClick={() => void purchase()} type="button">
            {phase === "preparing" ? "Cüzdan onayı bekleniyor…" : available ? "USDC ile satın al" : "Zincir ödemesi henüz kapalı"}
          </button>
          <p className="chainDisclosure">{available ? "Cüzdanınız işlemi imzalar; kupon ancak USDC escrow'a ulaşıp zincirde onaylanınca etkinleşir." : "Bu kampanya zincire bağlı değil veya ödeme yapılandırması eksik. USDC tahsil edilmez."}</p>
        </div>
      </section>
      <section className="dashboardShell detailInfoGrid">
        <article><p className="eyebrow">KULLANIM</p><h2>Nasıl çalışır?</h2><ol><li>Cüzdanınızı bağlayın ve kuponu alın.</li><li>Tek kullanımlık QR kodunu işletmede gösterin.</li><li>İşletme kodu doğruladığında kupon kullanılmış olur.</li></ol></article>
        <article><p className="eyebrow">KOŞULLAR</p><h2>Kupon bilgileri</h2><dl><div><dt>Son kullanım</dt><dd>{campaign.expiresAt}</dd></div><div><dt>Kullanım sınırı</dt><dd>Cüzdan başına 1</dd></div><div><dt>Ağ</dt><dd>Solana Devnet</dd></div></dl></article>
      </section>
      {shareOpen ? <ShareDialog title={campaign.title} url={shareUrl} onClose={() => setShareOpen(false)} /> : null}
    </main>
  );
}
