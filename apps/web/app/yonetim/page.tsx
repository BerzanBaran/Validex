"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { WalletButton } from "../../components/WalletButton";
import { ThemeToggle } from "../../components/ThemeToggle";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  decideMerchantApplication,
  listAuditEvents,
  listMerchantApplications,
  AuditEvent,
  MerchantProfile,
} from "../../lib/merchantApi";
import {
  accountExists, chainConfigured, initializePlatformInstruction, loadChain,
  registerMerchantInstruction, sendWalletTransaction,
} from "../../lib/validexChain";

const ADMIN_WALLET = process.env.NEXT_PUBLIC_VALIDEX_ADMIN_WALLET ?? "";

export default function AdminPage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [applications, setApplications] = useState<MerchantProfile[]>([]);
  const [verified, setVerified] = useState<MerchantProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [securityEvents, setSecurityEvents] = useState<AuditEvent[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [platformStatus, setPlatformStatus] = useState<"checking" | "ready" | "missing" | "unavailable">("checking");
  const [platformBusy, setPlatformBusy] = useState(false);

  useEffect(() => {
    if (!chainConfigured()) { setPlatformStatus("unavailable"); return; }
    let active = true;
    setPlatformStatus("checking");
    loadChain()
      .then(() => { if (active) setPlatformStatus("ready"); })
      .catch((error) => {
        if (!active) return;
        const detail = error instanceof Error ? error.message : "";
        setPlatformStatus(detail.includes("platform account is missing") ? "missing" : "unavailable");
      });
    return () => { active = false; };
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) {
      setApplications([]);
      setVerified([]);
      setAuditEvents([]);
      setSecurityEvents([]);
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all([listMerchantApplications(walletAddress), listMerchantApplications(walletAddress, "verified"), listAuditEvents(walletAddress), listAuditEvents(walletAddress, true)])
      .then(([pendingItems, verifiedItems, audit, suspicious]) => { if (active) { setApplications(pendingItems); setVerified(verifiedItems); setAuditEvents(audit); setSecurityEvents(suspicious); } })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Could not load applications."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [walletAddress]);

  async function decide(merchant: MerchantProfile, approved: boolean) {
    if (!walletAddress) return;
    try {
      if (approved && !chainConfigured()) throw new Error("Configure the on-chain program and USDC mint before approving a business.");
      if (approved) {
        // Complete the wallet-signed, idempotent chain registration first. This
        // prevents an API-approved merchant from being left without its PDA if
        // the admin rejects the wallet prompt or the transaction fails.
        await syncMerchant(merchant, walletAddress);
        const decided = await decideMerchantApplication(walletAddress, merchant.id, true);
        setApplications((current) => current.filter((item) => item.id !== merchant.id));
        setVerified((current) => [...current, decided]);
        setMessage(`${merchant.business_name} was approved in the API and on-chain.`);
      } else {
        await decideMerchantApplication(walletAddress, merchant.id, false);
        setApplications((current) => current.filter((item) => item.id !== merchant.id));
        setMessage(`${merchant.business_name}'s application was declined.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not complete the decision or on-chain registration.");
    }
  }

  async function syncMerchant(merchant: MerchantProfile, adminAddress = walletAddress) {
    if (!adminAddress) throw new Error("Connect the admin wallet.");
    const config = await loadChain();
    const { instruction, merchant: merchantPda } = await registerMerchantInstruction(config, adminAddress, merchant.wallet_address);
    if (!await accountExists(config, merchantPda)) {
      await sendWalletTransaction(config, adminAddress, instruction, merchantPda);
    }
  }

  async function initializePlatform() {
    if (!walletAddress || platformBusy) return;
    setPlatformBusy(true);
    try {
      if (ADMIN_WALLET && walletAddress !== ADMIN_WALLET) {
        throw new Error("Connect the configured admin wallet before initializing the platform.");
      }
      const { config, instruction } = await initializePlatformInstruction(walletAddress);
      const signature = await sendWalletTransaction(config, walletAddress, instruction, config.platform);
      await loadChain();
      setPlatformStatus("ready");
      setMessage(`Devnet platform initialized with Circle USDC. Transaction: ${signature}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Platform initialization failed.");
    } finally {
      setPlatformBusy(false);
    }
  }

  return (
    <main className="dashboardPage adminPage">
      <header className="dashboardHeader"><div className="dashboardShell adminNav"><Link className="brand" href="/">validex<span>.</span></Link><span>Admin center</span><div className="dashboardActions"><ThemeToggle /><WalletButton onAddressChange={setWalletAddress} /></div></div></header>
      <section className="dashboardShell adminHero"><div><p className="eyebrow">ADMIN DASHBOARD</p><h1>Trust starts with verified businesses.</h1><p>Review applications and give publishing access only to verified local merchants.</p></div><div className="adminMetric"><span>PENDING APPLICATIONS</span><strong>{applications.length}</strong><small>Connected through Solana wallet identity</small></div></section>
      {message ? <div className="dashboardShell notice" role="status">{message}<button onClick={() => setMessage(null)}>×</button></div> : null}
      <section className="dashboardShell adminApplications">
        <div className="contentHeading"><div><p className="eyebrow">DEVNET SETUP</p><h2>Platform status</h2></div><StatusBadge tone={platformStatus === "ready" ? "success" : "warning"}>{platformStatus === "ready" ? "READY" : platformStatus === "checking" ? "CHECKING" : "SETUP REQUIRED"}</StatusBadge></div>
        <p>{platformStatus === "ready" ? "Validex is initialized with the configured Devnet USDC mint." : platformStatus === "missing" ? "The program is deployed, but the platform has not been initialized yet. The admin wallet must approve this one-time transaction." : "The Devnet program or USDC configuration is not ready yet."}</p>
        {platformStatus === "missing" ? <button className="actionButton" disabled={!walletAddress || platformBusy || Boolean(ADMIN_WALLET && walletAddress !== ADMIN_WALLET)} onClick={() => void initializePlatform()} type="button">{platformBusy ? "Waiting for wallet and chain…" : "Initialize with Circle Devnet USDC"}</button> : null}
      </section>
      <section className="dashboardShell adminApplications">
        <div className="contentHeading"><div><p className="eyebrow">REVIEW QUEUE</p><h2>Merchant applications</h2></div><StatusBadge tone={walletAddress ? "success" : "warning"}>{walletAddress ? "WALLET CONNECTED" : "ADMIN WALLET REQUIRED"}</StatusBadge></div>
        {!walletAddress ? <div className="emptyState">Connect the admin wallet configured in `VALIDEX_ADMIN_WALLET` to view applications.</div> : loading ? <div className="emptyState">Loading applications…</div> : applications.length ? <div className="applicationList">{applications.map((merchant) => <article key={merchant.id}><div><StatusBadge tone="warning">PENDING</StatusBadge><h3>{merchant.business_name}</h3><p>{merchant.description || "No description provided."}</p><address>{merchant.address}</address><small>{merchant.wallet_address.slice(0, 6)}…{merchant.wallet_address.slice(-6)} · {new Date(merchant.created_at).toLocaleDateString("en-US")}</small></div><div className="decisionActions"><button onClick={() => void decide(merchant, false)} type="button">Decline</button><button className="approve" onClick={() => void decide(merchant, true)} type="button">Approve</button></div></article>)}</div> : <div className="emptyState">No pending merchant applications.</div>}
      </section>
      {walletAddress && verified.length ? <section className="dashboardShell adminApplications"><div className="contentHeading"><div><p className="eyebrow">ON-CHAIN REGISTRATION</p><h2>Verified merchants</h2></div></div><div className="applicationList">{verified.map((merchant) => <article key={merchant.id}><div><h3>{merchant.business_name}</h3><small>{merchant.wallet_address}</small></div><div className="decisionActions"><button className="approve" disabled={!chainConfigured()} onClick={() => void syncMerchant(merchant).then(() => setMessage("On-chain registration verified.")).catch((error) => setMessage(error instanceof Error ? error.message : "On-chain registration failed."))} type="button">Verify on-chain registration</button></div></article>)}</div></section> : null}
      {walletAddress ? <section className="dashboardShell adminApplications"><div className="contentHeading"><div><p className="eyebrow">SECURITY</p><h2>Suspicious verifications</h2></div><StatusBadge tone={securityEvents.length ? "warning" : "success"}>{securityEvents.length} records</StatusBadge></div><div className="applicationList">{securityEvents.length ? securityEvents.map((event) => <article key={event.id}><div><strong>{event.action}</strong><p>{event.entity_type}: {event.entity_id}</p><small>{event.actor_wallet ?? "Unknown wallet"} · {new Date(event.created_at).toLocaleString("en-US")}</small></div></article>) : <div className="emptyState">No suspicious QR attempts recorded.</div>}</div></section> : null}
      {walletAddress ? <section className="dashboardShell adminApplications"><div className="contentHeading"><div><p className="eyebrow">AUDIT LOG</p><h2>Recent activity</h2></div></div><div className="applicationList">{auditEvents.map((event) => <article key={event.id}><div><strong>{event.action}</strong><p>{event.entity_type}: {event.entity_id}</p><small>{event.actor_wallet ?? "Unknown wallet"} · {new Date(event.created_at).toLocaleString("en-US")}</small></div></article>)}</div></section> : null}
    </main>
  );
}
