"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { DashboardHeader } from "../../../../components/DashboardHeader";
import { CapacityMeter } from "../../../../components/ui/CapacityMeter";
import { ShareDialog } from "../../../../components/ui/ShareDialog";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { useMarketplace } from "../../../../lib/marketplace";

export default function MerchantCampaignPage() {
  const { id } = useParams<{ id: string }>();
  const marketplace = useMarketplace();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const campaign = useMemo(() => marketplace.campaigns.find((item) => item.id === id), [id, marketplace.campaigns]);
  const vouchers = marketplace.vouchers.filter((voucher) => voucher.campaignId === id);

  if (!marketplace.ready) return <main className="dashboardPage"><div className="pageState">Kampanya yükleniyor…</div></main>;
  if (!campaign) return <main className="dashboardPage"><div className="pageState"><h1>Kampanya bulunamadı</h1><Link href="/isletme">İşletme paneline dön</Link></div></main>;

  const authorized = walletAddress === campaign.ownerWallet;
  const redeemed = vouchers.filter((voucher) => voucher.status === "redeemed").length;
  const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}/kampanyalar/${campaign.id}`;

  return (
    <main className="dashboardPage merchantCampaignPage">
      <DashboardHeader role="merchant" onAddressChange={setWalletAddress} />
      <div className="dashboardShell breadcrumb"><Link href="/isletme">← Kampanyalarım</Link><span>/</span><span>Yönetim</span></div>
      {!walletAddress ? <div className="dashboardShell notice">Kampanyayı yönetmek için işletme cüzdanınızı bağlayın.</div> : null}
      {walletAddress && !authorized ? <div className="dashboardShell notice errorNotice">Bu kampanya bağlı cüzdan tarafından oluşturulmamış.</div> : null}
      <section className="dashboardShell managementHero">
        <div><StatusBadge tone={campaign.status === "published" ? "success" : "warning"}>{campaign.status === "published" ? "YAYINDA" : "DURAKLATILDI"}</StatusBadge><p className="eyebrow">{campaign.merchant} · {campaign.area}</p><h1>{campaign.title}</h1><p>{campaign.description}</p></div>
        <div className="managementActions"><button className="secondaryButton" disabled={!authorized} onClick={() => setShareOpen(true)}>Paylaş ↗</button><Link className={`actionLink ${!authorized ? "disabled" : ""}`} href={authorized ? `/isletme/kampanyalar/${campaign.id}/tara` : "#"}>QR tarayıcıyı aç</Link></div>
      </section>
      <section className="dashboardShell metricGrid managementMetrics">
        <div><span>Satılan kupon</span><strong>{campaign.sold}</strong><small>{campaign.stock} toplam stok</small></div>
        <div><span>Kullanılan</span><strong>{redeemed}</strong><small>{Math.max(0, vouchers.length - redeemed)} aktif kupon</small></div>
        <div><span>Demo gelir</span><strong>{(campaign.sold * campaign.priceUsdc).toFixed(2)} USDC</strong><small>Zincir dışı ön izleme</small></div>
      </section>
      <section className="dashboardShell managementGrid">
        <article className="managementCard"><div className="cardHeading"><div><p className="eyebrow">KAPASİTE</p><h2>Satış durumu</h2></div><span>{Math.round((campaign.sold / campaign.stock) * 100)}%</span></div><CapacityMeter sold={campaign.sold} stock={campaign.stock} /><button className="secondaryButton wide" disabled={!authorized} onClick={() => marketplace.setCampaignStatus(campaign.id, campaign.status === "published" ? "paused" : "published")} type="button">{campaign.status === "published" ? "Kampanyayı duraklat" : "Yeniden yayımla"}</button></article>
        <article className="managementCard"><div className="cardHeading"><div><p className="eyebrow">KUPONLAR</p><h2>Son hareketler</h2></div><span>{vouchers.length}</span></div>{vouchers.length ? <div className="activityList">{vouchers.slice(0, 6).map((voucher) => <div key={voucher.id}><span className={`activityDot ${voucher.status}`} /><div><strong>{voucher.code}</strong><small>{voucher.status === "redeemed" ? "Kullanıldı" : "Satın alındı"}</small></div><time>{new Date(voucher.redeemedAt ?? voucher.purchasedAt).toLocaleDateString("tr-TR")}</time></div>)}</div> : <div className="emptyState">Bu kampanya için henüz kupon satılmadı.</div>}</article>
      </section>
      {shareOpen ? <ShareDialog title={campaign.title} url={shareUrl} onClose={() => setShareOpen(false)} /> : null}
    </main>
  );
}
