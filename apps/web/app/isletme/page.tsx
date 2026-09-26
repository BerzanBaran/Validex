"use client";

import { FormEvent, useMemo, useState } from "react";

import { DashboardHeader } from "../../components/DashboardHeader";
import { CampaignDraft, useMarketplace } from "../../lib/marketplace";

const EMPTY_FORM = {
  merchant: "",
  title: "",
  description: "",
  area: "",
  category: "Kafe",
  priceUsdc: "",
  originalValueUsdc: "",
  stock: "",
  expiresAt: "",
};

export default function MerchantDashboard() {
  const marketplace = useMarketplace();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [notice, setNotice] = useState<string | null>(null);

  const myCampaigns = useMemo(
    () => marketplace.campaigns.filter((campaign) => walletAddress && campaign.ownerWallet === walletAddress),
    [marketplace.campaigns, walletAddress],
  );
  const totalSales = myCampaigns.reduce((sum, campaign) => sum + campaign.sold, 0);
  const grossRevenue = myCampaigns.reduce(
    (sum, campaign) => sum + campaign.sold * campaign.priceUsdc,
    0,
  );

  function update(name: keyof typeof EMPTY_FORM, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!walletAddress) {
      setNotice("Kampanya yayımlamak için önce işletme cüzdanınızı bağlayın.");
      return;
    }
    const draft: CampaignDraft = {
      ownerWallet: walletAddress,
      merchant: form.merchant.trim(),
      title: form.title.trim(),
      description: form.description.trim(),
      area: form.area.trim(),
      category: form.category,
      priceUsdc: Number(form.priceUsdc),
      originalValueUsdc: Number(form.originalValueUsdc),
      stock: Number(form.stock),
      expiresAt: form.expiresAt,
    };
    if (draft.priceUsdc <= 0 || draft.stock <= 0 || draft.originalValueUsdc < draft.priceUsdc) {
      setNotice("Fiyat, ürün değeri ve stok alanlarını kontrol edin.");
      return;
    }
    if (new Date(draft.expiresAt).getTime() <= Date.now()) {
      setNotice("Son kullanım tarihi gelecekte olmalıdır.");
      return;
    }
    marketplace.createCampaign(draft);
    setForm(EMPTY_FORM);
    setNotice("Kampanya yayımlandı. Artık müşteri panelinde görülebilir.");
  }

  return (
    <main className="dashboardPage merchantDashboard">
      <DashboardHeader role="merchant" onAddressChange={setWalletAddress} />
      <section className="dashboardShell dashboardHero merchantHero">
        <div>
          <p className="eyebrow">İŞLETME PANELİ</p>
          <h1>Kampanyanı oluştur, mahallene ulaş.</h1>
          <p>Kupon fiyatını, stoğunu ve süresini belirle; satışlarını tek ekrandan izle.</p>
        </div>
        <div className="verificationCard"><span>İŞLETME DURUMU</span><strong>{walletAddress ? "Demo işletme" : "Cüzdan bekleniyor"}</strong><small>Üretimde yönetici doğrulaması zorunlu olacaktır.</small></div>
      </section>

      {notice ? <div className="dashboardShell notice" role="status">{notice}<button onClick={() => setNotice(null)}>×</button></div> : null}

      <section className="dashboardShell metricGrid">
        <div><span>Aktif kampanya</span><strong>{myCampaigns.filter((item) => item.status === "published").length}</strong></div>
        <div><span>Satılan kupon</span><strong>{totalSales}</strong></div>
        <div><span>Brüt demo geliri</span><strong>{grossRevenue.toFixed(2)} USDC</strong></div>
      </section>

      <section className="dashboardShell merchantWorkspace">
        <form className="campaignForm" onSubmit={submit}>
          <div className="formHeading"><p className="eyebrow">YENİ KAMPANYA</p><h2>Kupon yayımla</h2><p>Yayımlanan kupon müşteri panelinde hemen görünür.</p></div>
          <label>İşletme adı<input required value={form.merchant} onChange={(event) => update("merchant", event.target.value)} placeholder="Örn. Kavurucu No.7" /></label>
          <label>Kampanya başlığı<input required minLength={3} value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Örn. İki kahve, tek fiyat" /></label>
          <label>Açıklama<textarea required minLength={10} value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Kampanyanın kapsamı ve kullanım koşulları" /></label>
          <div className="formRow"><label>Semt<input required value={form.area} onChange={(event) => update("area", event.target.value)} placeholder="Kadıköy" /></label><label>Kategori<select value={form.category} onChange={(event) => update("category", event.target.value)}><option>Kafe</option><option>Kahve</option><option>Kahvaltı</option><option>Restoran</option></select></label></div>
          <div className="formRow"><label>Kupon fiyatı (USDC)<input required min="0.01" step="0.01" type="number" value={form.priceUsdc} onChange={(event) => update("priceUsdc", event.target.value)} /></label><label>Normal değer (USDC)<input required min="0.01" step="0.01" type="number" value={form.originalValueUsdc} onChange={(event) => update("originalValueUsdc", event.target.value)} /></label></div>
          <div className="formRow"><label>Stok<input required min="1" type="number" value={form.stock} onChange={(event) => update("stock", event.target.value)} /></label><label>Son kullanım tarihi<input required type="date" value={form.expiresAt} onChange={(event) => update("expiresAt", event.target.value)} /></label></div>
          <div className="feePreview"><span>Platform komisyonu</span><strong>%2</strong><small>Gerçek ödeme escrow programı devreye alındığında kesilir.</small></div>
          <button className="actionButton" type="submit">Kampanyayı yayımla</button>
        </form>

        <div className="merchantCampaigns">
          <div className="contentHeading"><div><p className="eyebrow">KAMPANYALARIM</p><h2>Yayındaki kuponlar</h2></div></div>
          {!walletAddress ? <div className="emptyState">Kampanyalarınızı görmek için işletme cüzdanınızı bağlayın.</div> : null}
          {walletAddress && !myCampaigns.length ? <div className="emptyState">Henüz kampanya oluşturmadınız. Formu doldurarak ilk kuponunuzu yayımlayın.</div> : null}
          <div className="manageList">
            {myCampaigns.map((campaign) => (
              <article className="manageRow" key={campaign.id}>
                <div><span className={`statusPill ${campaign.status}`}>{campaign.status === "published" ? "YAYINDA" : "DURAKLATILDI"}</span><h3>{campaign.title}</h3><p>{campaign.priceUsdc} USDC · {campaign.sold}/{campaign.stock} satıldı · {campaign.expiresAt}</p></div>
                <button onClick={() => marketplace.setCampaignStatus(campaign.id, campaign.status === "published" ? "paused" : "published")} type="button">{campaign.status === "published" ? "Duraklat" : "Yayımla"}</button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="demoBanner">Demo modu: Kampanyalar tarayıcıda saklanır; zincir işlemi oluşturulmaz.</div>
    </main>
  );
}
