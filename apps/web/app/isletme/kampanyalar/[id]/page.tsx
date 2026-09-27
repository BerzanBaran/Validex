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

  if (!marketplace.ready) return <main className="dashboardPage"><div className="pageState">Kampanya yükleniyor…</div></main>;
  if (!campaign) return <main className="dashboardPage"><div className="pageState"><h1>Kampanya bulunamadı</h1><Link href="/isletme">İşletme paneline dön</Link></div></main>;

  const authorized = walletAddress === campaign.ownerWallet;
  const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}/kampanyalar/${campaign.id}`;

  async function cancelCampaign() {
    if (!walletAddress || !campaign?.chainCampaign || !window.confirm("Kampanya kalıcı olarak iptal edilecek. Kullanılmamış kupon sahipleri USDC iadesi isteyebilecek. Devam edilsin mi?")) return;
    try {
      setBusy(true);
      const config = await loadChain();
      const { instruction, campaign: address } = await cancelCampaignInstruction(config, walletAddress, campaign.chainCampaign);
      const signature = await sendWalletTransaction(config, walletAddress, instruction, address, (submitted) => {
        window.localStorage.setItem(`validex:cancel:${id}`, submitted);
        setPendingSignature(submitted);
      });
      if (!await campaignCancelled(config, address)) throw new Error("Zincirde iptal durumu henüz doğrulanamadı; işlemi tekrar göndermeyin.");
      const updated = await confirmCampaignCancellation(campaign.id, walletAddress, signature);
      marketplace.saveCampaign(updated);
      window.localStorage.removeItem(`validex:cancel:${id}`);
      setPendingSignature("");
      setNotice("Kampanya zincirde iptal edildi. Aktif kuponların sahipleri iade talep edebilir.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Kampanya iptali tamamlanamadı.");
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
        setNotice("Önceki iptal işlemi zincirde başarısız oldu. Yeniden deneyebilirsiniz.");
        return;
      }
      if (status !== "finalized") {
        setNotice("İptal işlemi henüz kesinleşmedi. Aynı işlemi yeniden göndermeyin.");
        return;
      }
      const updated = await confirmCampaignCancellation(campaign.id, walletAddress, pendingSignature);
      marketplace.saveCampaign(updated);
      window.localStorage.removeItem(`validex:cancel:${id}`);
      setPendingSignature("");
      setNotice("Zincirdeki iptal API kaydıyla eşitlendi. Kupon sahipleri iade talep edebilir.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "İptal kaydı eşitlenemedi.");
    } finally { setBusy(false); }
  }

  return (
    <main className="dashboardPage merchantCampaignPage">
      <DashboardHeader role="merchant" onAddressChange={setWalletAddress} />
      <div className="dashboardShell breadcrumb"><Link href="/isletme">← Kampanyalarım</Link><span>/</span><span>Yönetim</span></div>
      {!walletAddress ? <div className="dashboardShell notice">Kampanyayı yönetmek için işletme cüzdanınızı bağlayın.</div> : null}
      {walletAddress && !authorized ? <div className="dashboardShell notice errorNotice">Bu kampanya bağlı cüzdan tarafından oluşturulmamış.</div> : null}
      {notice ? <div className="dashboardShell notice" role="status">{notice}</div> : null}
      <section className="dashboardShell managementHero">
        <div><StatusBadge tone={campaign.status === "published" ? "success" : "warning"}>{campaign.status === "published" ? "YAYINDA" : campaign.status === "cancelled" ? "İPTAL EDİLDİ" : "KAPALI"}</StatusBadge><p className="eyebrow">{campaign.merchant} · {campaign.area}</p><h1>{campaign.title}</h1><p>{campaign.description}</p></div>
        <div className="managementActions"><button className="secondaryButton" disabled={!authorized} onClick={() => setShareOpen(true)}>Paylaş ↗</button><Link className={`actionLink ${!authorized ? "disabled" : ""}`} href={authorized ? `/isletme/kampanyalar/${campaign.id}/tara` : "#"}>QR tarayıcıyı aç</Link></div>
      </section>
      <section className="dashboardShell metricGrid managementMetrics">
        <div><span>Satılan kupon</span><strong>{campaign.sold}</strong><small>{campaign.stock} toplam stok</small></div>
        <div><span>Kalan stok</span><strong>{Math.max(0, campaign.stock - campaign.sold)}</strong><small>Satışlar API'den okunur</small></div>
        <div><span>Brüt satış (escrow dahil)</span><strong>{(campaign.sold * campaign.priceUsdc).toFixed(2)} USDC</strong><small>İşletmeye ödeme yalnızca kupon kullanıldığında</small></div>
      </section>
      <section className="dashboardShell managementGrid">
        <article className="managementCard"><div className="cardHeading"><div><p className="eyebrow">KAPASİTE</p><h2>Satış durumu</h2></div><span>{Math.round((campaign.sold / campaign.stock) * 100)}%</span></div><CapacityMeter sold={campaign.sold} stock={campaign.stock} /><button className="secondaryButton wide" disabled={!authorized || !chainConfigured() || !campaign.chainCampaign || campaign.status !== "published" || busy || !!pendingSignature} onClick={() => void cancelCampaign()} type="button">{busy ? "Zincir onayı bekleniyor…" : campaign.status === "published" ? "Kampanyayı zincirde iptal et" : "Kampanya kapalı"}</button>{pendingSignature && authorized ? <div className="manualCodeForm"><p>İptal işlemi gönderildi: {pendingSignature}. Yeni işlem göndermeden API kaydını eşitleyin.</p><button className="secondaryButton wide" disabled={busy} onClick={() => void retryCancellationConfirmation()} type="button">İptal kaydını yeniden doğrula</button></div> : null}</article>
        <article className="managementCard"><div className="cardHeading"><div><p className="eyebrow">KUPONLAR</p><h2>Satış bilgisi</h2></div></div><p>Doğrulanmış kupon satışları ve kalan stok, kampanya API'sindeki güncel kayıtlardan gösterilir. Müşteri kuponları işletme tarayıcısında saklanmaz.</p></article>
      </section>
      {shareOpen ? <ShareDialog title={campaign.title} url={shareUrl} onClose={() => setShareOpen(false)} /> : null}
    </main>
  );
}
