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
  category: "Cafe",
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
        if (active) setNotice(error instanceof Error ? error.message : "Could not load business details.");
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
      .catch((error) => { if (active) setNotice(error instanceof Error ? error.message : "Could not load staff members."); });
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
      setNotice("Connect your merchant wallet before publishing an offer.");
      return;
    }
    if (merchantProfile?.verification_status !== "verified") {
      setNotice("Your merchant application must be approved before publishing an offer.");
      return;
    }
    if (!chainConfigured()) {
      setNotice("The program and USDC mint must be configured before publishing a live offer.");
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
      setNotice("Check the price, original value, and stock fields.");
      return;
    }
    if (new Date(draft.expiresAt).getTime() <= Date.now()) {
      setNotice("The expiration date must be in the future.");
      return;
    }
    try {
      setPublishing(true);
      const config = await loadChain();
      if (!await accountExists(config, merchantPda(config, walletAddress))) {
        throw new Error("Your business has not yet been registered on-chain by the admin.");
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
      setNotice("Your offer was confirmed on-chain and published.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The on-chain offer could not be created.");
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
      setNotice("Your business application was received. You can publish offers after admin approval.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not submit the application.");
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
      setNotice("This staff wallet can verify QR codes only.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not grant staff access.");
    } finally { setStaffBusy(false); }
  }

  async function removeStaff(staffId: string) {
    if (!walletAddress) return;
    try {
      setStaffBusy(true);
      await revokeStaff(walletAddress, staffId);
      setStaff(await listStaff(walletAddress));
      setNotice("Staff QR access was revoked.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not revoke staff access.");
    } finally { setStaffBusy(false); }
  }

  return (
    <main className="dashboardPage merchantDashboard">
      <DashboardHeader role="merchant" onAddressChange={setWalletAddress} />
      <section className="dashboardShell dashboardHero merchantHero">
        <div>
          <p className="eyebrow"><span className="sparkle">✳</span> YOUR BUSINESS, FRONT AND CENTER</p>
          <h1>A great offer,<br /><em>a new regular.</em></h1>
          <p>Create an offer that reaches your neighborhood. Manage vouchers, sales, and guests in one place.</p>
        </div>
        <div className="verificationCard"><span>MERCHANT STATUS</span><strong>{!walletAddress ? "Connect a wallet" : merchantProfile === undefined ? "Checking…" : merchantProfile === null && staffCampaigns.length ? "QR verification staff" : merchantProfile === null ? "Application required" : merchantProfile.verification_status === "verified" ? "Verified business" : merchantProfile.verification_status === "pending" ? "Awaiting approval" : "Application declined"}</strong><small>{merchantProfile?.business_name ?? (staffCampaigns.length ? "You can verify QR codes for assigned offers." : "Business verification is required to publish offers.")}</small></div>
      </section>

      {notice ? <div className="dashboardShell notice" role="status">{notice}<button onClick={() => setNotice(null)}>×</button></div> : null}

      {walletAddress && merchantProfile === null && !staffCampaigns.length ? (
        <section className="dashboardShell onboardingCard">
          <div><p className="eyebrow">MERCHANT APPLICATION</p><h2>Verify your business on Validex.</h2><p>Your business details are not written on-chain. After admin review, your wallet can publish offers.</p></div>
          <form onSubmit={submitApplication}>
            <label>Business name<input required minLength={2} value={application.business_name} onChange={(event) => setApplication((current) => ({ ...current, business_name: event.target.value }))} /></label>
            <label>Address<input required minLength={5} value={application.address} onChange={(event) => setApplication((current) => ({ ...current, address: event.target.value }))} /></label>
            <label>Description<textarea value={application.description} onChange={(event) => setApplication((current) => ({ ...current, description: event.target.value }))} /></label>
            <button className="actionButton" disabled={applicationBusy} type="submit">{applicationBusy ? "Submitting…" : "Submit application"}</button>
          </form>
        </section>
      ) : null}

      {merchantProfile?.verification_status === "pending" ? <div className="dashboardShell approvalState"><span>⌛</span><div><strong>Your application is under review</strong><p>Offer publishing will unlock after approval.</p></div></div> : null}

      {merchantProfile?.verification_status === "verified" && walletAddress ? <section className="dashboardShell onboardingCard"><div><p className="eyebrow">STAFF ACCESS</p><h2>QR verification wallets</h2><p>Staff can check a voucher's API and on-chain status. Redemption and USDC payout still require the owner's signature.</p></div><div><form className="manualCodeForm" onSubmit={addStaff}><label>Staff Solana public key<input required value={staffWallet} onChange={(event) => setStaffWallet(event.target.value)} /></label><button className="secondaryButton wide" disabled={staffBusy} type="submit">Grant QR access</button></form><div className="manageList">{staff.filter((item) => item.active).map((item) => <div className="manageRow" key={item.id}><span>{item.wallet_address}</span><button className="secondaryButton" disabled={staffBusy} onClick={() => void removeStaff(item.id)} type="button">Revoke access</button></div>)}</div></div></section> : null}

      {staffCampaigns.length ? <section className="dashboardShell onboardingCard"><div><p className="eyebrow">STAFF ACCESS</p><h2>Offers you can verify</h2><p>This access is for QR checks only; your wallet cannot authorize escrow payouts.</p></div><div className="manageList">{staffCampaigns.map((item) => <Link className="manageRow" href={`/isletme/kampanyalar/${item.campaign_id}/tara`} key={item.campaign_id}>{item.merchant_name} · {item.title} →</Link>)}</div></section> : null}

      <section className="dashboardShell metricGrid">
        <div><span>Active offers</span><strong>{myCampaigns.filter((item) => item.status === "published").length}</strong></div>
        <div><span>Vouchers sold</span><strong>{totalSales}</strong></div>
        <div><span>Gross sales (including escrow)</span><strong>{grossRevenue.toFixed(2)} USDC</strong></div>
      </section>

      <section className="dashboardShell merchantWorkspace">
        <form className="campaignForm" onSubmit={submit}>
          <div className="formHeading"><p className="eyebrow">A FRESH OFFER</p><h2>Create your voucher <span className="headingSpark">✳</span></h2><p>Published offers appear in the customer dashboard.</p></div>
          <label>Business name<input required value={form.merchant} onChange={(event) => update("merchant", event.target.value)} placeholder="e.g. Corner Coffee No. 7" /></label>
          <label>Offer title<input required minLength={3} value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="e.g. Two coffees for the price of one" /></label>
          <label>Description<textarea required minLength={10} value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="What's included and how to redeem" /></label>
          <div className="formRow"><label>Neighborhood<input required value={form.area} onChange={(event) => update("area", event.target.value)} placeholder="e.g. Brooklyn" /></label><label>Category<select value={form.category} onChange={(event) => update("category", event.target.value)}><option>Cafe</option><option>Coffee</option><option>Brunch</option><option>Restaurant</option></select></label></div>
          <div className="formRow"><label>Voucher price (USDC)<input required min="0.01" step="0.01" type="number" value={form.priceUsdc} onChange={(event) => update("priceUsdc", event.target.value)} /></label><label>Original value (USDC)<input required min="0.01" step="0.01" type="number" value={form.originalValueUsdc} onChange={(event) => update("originalValueUsdc", event.target.value)} /></label></div>
          <div className="formRow"><label>Stock<input required min="1" type="number" value={form.stock} onChange={(event) => update("stock", event.target.value)} /></label><label>Expiration date<input required type="date" value={form.expiresAt} onChange={(event) => update("expiresAt", event.target.value)} /></label></div>
          <div className="feePreview"><span>Platform fee</span><strong>2%</strong><small>Deducted from escrow when both parties redeem the voucher.</small></div>
          <button className="actionButton" disabled={merchantProfile?.verification_status !== "verified" || !chainConfigured() || publishing} type="submit">{publishing ? "Waiting for wallet and chain confirmation…" : "Publish offer on-chain"}</button>
        </form>

        <div className="merchantCampaigns">
          <div className="contentHeading"><div><p className="eyebrow">YOUR STOREFRONT</p><h2>Your offers</h2></div></div>
          {marketplace.campaignError ? <div className="emptyState" role="alert">Offers could not be loaded: {marketplace.campaignError} <button className="secondaryButton" onClick={() => void marketplace.refreshCampaigns().catch(() => {})} type="button">Try again</button></div> : null}
          {!walletAddress ? <div className="emptyState">Connect your merchant wallet to see your offers.</div> : null}
          {walletAddress && !marketplace.campaignError && !myCampaigns.length ? <div className="emptyState">No offers yet. Fill out the form to publish your first voucher.</div> : null}
          <div className="manageList">
            {myCampaigns.map((campaign) => (
              <article className="manageRow" key={campaign.id}>
                <div><span className={`statusPill ${campaign.status}`}>{campaign.status === "published" ? "LIVE" : campaign.status === "cancelled" ? "CANCELLED" : "CLOSED"}</span><h3>{campaign.title}</h3><p>{campaign.priceUsdc} USDC · {campaign.sold}/{campaign.stock} sold · {campaign.expiresAt}</p></div>
                <div className="manageActions"><Link href={`/isletme/kampanyalar/${campaign.id}`}>Manage / cancel</Link></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="demoBanner">{chainConfigured() ? "Publishing requires your merchant wallet signature and on-chain confirmation." : "On-chain mode is off until the admin, program, and USDC mint are configured."}</div>
    </main>
  );
}
