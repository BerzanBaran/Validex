"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { DashboardHeader } from "../../components/DashboardHeader";
import { CampaignDraft, useMarketplace } from "../../lib/marketplace";
import {
  createMerchantApplication,
  getMyMerchant,
  grantStaff,
  listStaff,
  listStaffCampaigns,
  MerchantProfile,
  revokeStaff,
  StaffCampaign,
  StaffWallet,
} from "../../lib/merchantApi";
import {
  accountExists, chainConfigured, createCampaignInstruction, hashCampaignMetadata, loadChain,
  merchantPda, randomCampaignId, sendWalletTransaction, usdcMinor,
} from "../../lib/validexChain";
import { publishOnchainCampaign } from "../../lib/campaignApi";

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

const EMPTY_APPLICATION = { business_name: "", description: "", address: "" };

export default function MerchantDashboard() {
  const marketplace = useMarketplace();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [notice, setNotice] = useState<string | null>(null);
  const [merchantProfile, setMerchantProfile] = useState<MerchantProfile | null | undefined>();
  const [application, setApplication] = useState(EMPTY_APPLICATION);
  const [applicationBusy, setApplicationBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [staffWallet, setStaffWallet] = useState("");
  const [staff, setStaff] = useState<StaffWallet[]>([]);
  const [staffCampaigns, setStaffCampaigns] = useState<StaffCampaign[]>([]);
  const [staffBusy, setStaffBusy] = useState(false);

  useEffect(() => {
    if (!walletAddress) {
      setMerchantProfile(undefined);
      return;
    }
    let active = true;
    getMyMerchant(walletAddress)
      .then((profile) => { if (active) setMerchantProfile(profile); })
      .catch((error) => {
        if (active) setNotice(error instanceof Error ? error.message : "İşletme bilgisi alınamadı.");
      });
    return () => { active = false; };
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) { setStaffCampaigns([]); return; }
    let active = true;
    listStaffCampaigns(walletAddress)
      .then((items) => { if (active) setStaffCampaigns(items); })
      .catch(() => { if (active) setStaffCampaigns([]); });
    return () => { active = false; };
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress || merchantProfile?.verification_status !== "verified") { setStaff([]); return; }
    let active = true;
    listStaff(walletAddress)
      .then((items) => { if (active) setStaff(items); })
      .catch((error) => { if (active) setNotice(error instanceof Error ? error.message : "Çalışanlar alınamadı."); });
    return () => { active = false; };
  }, [walletAddress, merchantProfile?.verification_status]);

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!walletAddress) {
      setNotice("Kampanya yayımlamak için önce işletme cüzdanınızı bağlayın.");
      return;
    }
    if (merchantProfile?.verification_status !== "verified") {
      setNotice("Kampanya yayımlamak için işletme başvurunuzun onaylanması gerekir.");
      return;
    }
    if (!chainConfigured()) {
      setNotice("Program ve USDC mint ayarlanana kadar gerçek kampanya yayımlanamaz.");
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
    try {
      setPublishing(true);
      const config = await loadChain();
      if (!await accountExists(config, merchantPda(config, walletAddress))) {
        throw new Error("İşletmeniz henüz zincirde yönetici tarafından kaydedilmemiş.");
      }
      const campaignId = randomCampaignId();
      const startsAt = Math.floor(Date.now() / 1000);
      const expiresAt = Math.floor(new Date(draft.expiresAt).getTime() / 1000);
      const priceMinor = usdcMinor(draft.priceUsdc);
      const metadataHash = await hashCampaignMetadata([
        walletAddress, draft.title, draft.description, Number(priceMinor),
        Number(usdcMinor(draft.originalValueUsdc)), draft.stock, 1, startsAt, expiresAt,
      ]);
      const { instruction, campaign } = await createCampaignInstruction(config, {
        merchantWallet: walletAddress, campaignId, metadataHash,
        priceMinor, stock: draft.stock, perUserLimit: 1,
        startsAt: BigInt(startsAt), expiresAt: BigInt(expiresAt),
      });
      const signature = await sendWalletTransaction(config, walletAddress, instruction, campaign);
      const published = await publishOnchainCampaign({
        walletAddress, merchantId: merchantProfile.id, draft,
        campaignAddress: campaign.toBase58(), chainId: campaignId.toString(), signature,
        startsAt, expiresAt,
      });
      marketplace.saveCampaign(published);
      setForm(EMPTY_FORM);
      setNotice("Kampanya zincirde onaylandı ve yayımlandı.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Kampanya zincirde oluşturulamadı.");
    } finally {
      setPublishing(false);
    }
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!walletAddress) return;
    try {
      setApplicationBusy(true);
      const profile = await createMerchantApplication(walletAddress, application);
      setMerchantProfile(profile);
      setApplication(EMPTY_APPLICATION);
      setNotice("İşletme başvurunuz alındı. Yönetici onayından sonra kampanya yayımlayabilirsiniz.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Başvuru oluşturulamadı.");
    } finally {
      setApplicationBusy(false);
    }
  }

  async function addStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!walletAddress) return;
    try {
      setStaffBusy(true);
      await grantStaff(walletAddress, staffWallet.trim());
      setStaff(await listStaff(walletAddress));
      setStaffWallet("");
      setNotice("Çalışan cüzdanına yalnızca QR doğrulama yetkisi verildi.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Çalışan yetkisi verilemedi.");
    } finally { setStaffBusy(false); }
  }

  async function removeStaff(staffId: string) {
    if (!walletAddress) return;
    try {
      setStaffBusy(true);
      await revokeStaff(walletAddress, staffId);
      setStaff(await listStaff(walletAddress));
      setNotice("Çalışanın QR yetkisi kaldırıldı.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Çalışan yetkisi kaldırılamadı.");
    } finally { setStaffBusy(false); }
  }

  return (
    <main className="dashboardPage merchantDashboard">
      <DashboardHeader role="merchant" onAddressChange={setWalletAddress} />
      <section className="dashboardShell dashboardHero merchantHero">
        <div>
          <p className="eyebrow"><span className="sparkle">✳</span> İŞLETMENİN YENİ VİTRİNİ</p>
          <h1>Güzel bir teklif,<br /><em>yeni bir müdavim.</em></h1>
          <p>Kampanyanı oluştur, mahallene ulaş. Kuponlarını, satışlarını ve misafirlerini tek bir yerden yönet.</p>
        </div>
        <div className="verificationCard"><span>İŞLETME DURUMU</span><strong>{!walletAddress ? "Cüzdan bekleniyor" : merchantProfile === undefined ? "Kontrol ediliyor…" : merchantProfile === null && staffCampaigns.length ? "QR doğrulama çalışanı" : merchantProfile === null ? "Başvuru gerekli" : merchantProfile.verification_status === "verified" ? "Onaylı işletme" : merchantProfile.verification_status === "pending" ? "Onay bekleniyor" : "Başvuru reddedildi"}</strong><small>{merchantProfile?.business_name ?? (staffCampaigns.length ? "Atanmış kampanyaların QR kodlarını doğrulayabilirsiniz." : "Kampanya yayımlamak için işletme doğrulaması zorunludur.")}</small></div>
      </section>

      {notice ? <div className="dashboardShell notice" role="status">{notice}<button onClick={() => setNotice(null)}>×</button></div> : null}

      {walletAddress && merchantProfile === null && !staffCampaigns.length ? (
        <section className="dashboardShell onboardingCard">
          <div><p className="eyebrow">İŞLETME BAŞVURUSU</p><h2>Validex’te işletmeni doğrula.</h2><p>İşletme bilgileri zincire yazılmaz. Yönetici incelemesinden sonra kampanya yayımlama yetkisi cüzdanınıza tanımlanır.</p></div>
          <form onSubmit={submitApplication}>
            <label>İşletme adı<input required minLength={2} value={application.business_name} onChange={(event) => setApplication((current) => ({ ...current, business_name: event.target.value }))} /></label>
            <label>Adres<input required minLength={5} value={application.address} onChange={(event) => setApplication((current) => ({ ...current, address: event.target.value }))} /></label>
            <label>Açıklama<textarea value={application.description} onChange={(event) => setApplication((current) => ({ ...current, description: event.target.value }))} /></label>
            <button className="actionButton" disabled={applicationBusy} type="submit">{applicationBusy ? "Gönderiliyor…" : "Başvuruyu gönder"}</button>
          </form>
        </section>
      ) : null}

      {merchantProfile?.verification_status === "pending" ? <div className="dashboardShell approvalState"><span>⌛</span><div><strong>Başvurunuz inceleniyor</strong><p>Onaylandığında kampanya yayımlama alanı etkinleşecektir.</p></div></div> : null}

      {merchantProfile?.verification_status === "verified" && walletAddress ? <section className="dashboardShell onboardingCard"><div><p className="eyebrow">ÇALIŞAN YETKİLERİ</p><h2>QR doğrulama cüzdanları</h2><p>Çalışanlar kuponun API ve zincir durumunu kontrol eder. Kupon kullanımı ve USDC ödemesi için işletme sahibi imzası gerekir.</p></div><div><form className="manualCodeForm" onSubmit={addStaff}><label>Çalışan Solana public key'i<input required value={staffWallet} onChange={(event) => setStaffWallet(event.target.value)} /></label><button className="secondaryButton wide" disabled={staffBusy} type="submit">QR yetkisi ver</button></form><div className="manageList">{staff.filter((item) => item.active).map((item) => <div className="manageRow" key={item.id}><span>{item.wallet_address}</span><button className="secondaryButton" disabled={staffBusy} onClick={() => void removeStaff(item.id)} type="button">Yetkiyi kaldır</button></div>)}</div></div></section> : null}

      {staffCampaigns.length ? <section className="dashboardShell onboardingCard"><div><p className="eyebrow">ÇALIŞAN ERİŞİMİ</p><h2>Doğrulayabileceğiniz kampanyalar</h2><p>Bu erişim yalnızca QR kontrolü içindir; cüzdanınız escrow ödemesini imzalayamaz.</p></div><div className="manageList">{staffCampaigns.map((item) => <Link className="manageRow" href={`/isletme/kampanyalar/${item.campaign_id}/tara`} key={item.campaign_id}>{item.merchant_name} · {item.title} →</Link>)}</div></section> : null}

      <section className="dashboardShell metricGrid">
        <div><span>Aktif kampanya</span><strong>{myCampaigns.filter((item) => item.status === "published").length}</strong></div>
        <div><span>Satılan kupon</span><strong>{totalSales}</strong></div>
        <div><span>Brüt satış tutarı (escrow dahil)</span><strong>{grossRevenue.toFixed(2)} USDC</strong></div>
      </section>

      <section className="dashboardShell merchantWorkspace">
        <form className="campaignForm" onSubmit={submit}>
          <div className="formHeading"><p className="eyebrow">YENİ BİR FIRSAT</p><h2>Kuponunu tasarla <span className="headingSpark">✳</span></h2><p>Yayımlanan kupon müşteri panelinde hemen görünür.</p></div>
          <label>İşletme adı<input required value={form.merchant} onChange={(event) => update("merchant", event.target.value)} placeholder="Örn. Kavurucu No.7" /></label>
          <label>Kampanya başlığı<input required minLength={3} value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Örn. İki kahve, tek fiyat" /></label>
          <label>Açıklama<textarea required minLength={10} value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Kampanyanın kapsamı ve kullanım koşulları" /></label>
          <div className="formRow"><label>Semt<input required value={form.area} onChange={(event) => update("area", event.target.value)} placeholder="Kadıköy" /></label><label>Kategori<select value={form.category} onChange={(event) => update("category", event.target.value)}><option>Kafe</option><option>Kahve</option><option>Kahvaltı</option><option>Restoran</option></select></label></div>
          <div className="formRow"><label>Kupon fiyatı (USDC)<input required min="0.01" step="0.01" type="number" value={form.priceUsdc} onChange={(event) => update("priceUsdc", event.target.value)} /></label><label>Normal değer (USDC)<input required min="0.01" step="0.01" type="number" value={form.originalValueUsdc} onChange={(event) => update("originalValueUsdc", event.target.value)} /></label></div>
          <div className="formRow"><label>Stok<input required min="1" type="number" value={form.stock} onChange={(event) => update("stock", event.target.value)} /></label><label>Son kullanım tarihi<input required type="date" value={form.expiresAt} onChange={(event) => update("expiresAt", event.target.value)} /></label></div>
          <div className="feePreview"><span>Platform komisyonu</span><strong>%2</strong><small>Kupon iki tarafça kullanıldığında escrow'dan kesilir.</small></div>
          <button className="actionButton" disabled={merchantProfile?.verification_status !== "verified" || !chainConfigured() || publishing} type="submit">{publishing ? "Cüzdan ve zincir onayı bekleniyor…" : "Kampanyayı zincirde yayımla"}</button>
        </form>

        <div className="merchantCampaigns">
          <div className="contentHeading"><div><p className="eyebrow">İŞLETMENİN VİTRİNİ</p><h2>Kampanyaların</h2></div></div>
          {marketplace.campaignError ? <div className="emptyState" role="alert">Kampanyalar API'den yüklenemedi: {marketplace.campaignError} <button className="secondaryButton" onClick={() => void marketplace.refreshCampaigns().catch(() => {})} type="button">Tekrar dene</button></div> : null}
          {!walletAddress ? <div className="emptyState">Kampanyalarınızı görmek için işletme cüzdanınızı bağlayın.</div> : null}
          {walletAddress && !marketplace.campaignError && !myCampaigns.length ? <div className="emptyState">Henüz kampanya oluşturmadınız. Formu doldurarak ilk kuponunuzu yayımlayın.</div> : null}
          <div className="manageList">
            {myCampaigns.map((campaign) => (
              <article className="manageRow" key={campaign.id}>
                <div><span className={`statusPill ${campaign.status}`}>{campaign.status === "published" ? "YAYINDA" : campaign.status === "cancelled" ? "İPTAL EDİLDİ" : "KAPALI"}</span><h3>{campaign.title}</h3><p>{campaign.priceUsdc} USDC · {campaign.sold}/{campaign.stock} satıldı · {campaign.expiresAt}</p></div>
                <div className="manageActions"><Link href={`/isletme/kampanyalar/${campaign.id}`}>Yönet / iptal et</Link></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="demoBanner">{chainConfigured() ? "Yayımlama için işletme cüzdanı imzası ve zincir onayı gerekir. Kampanya listesi API'den yüklenir." : "Zincir modu kapalı: Yönetici adresi, program ve USDC mint kurulmadan kampanya yayımlanamaz."}</div>
    </main>
  );
}
