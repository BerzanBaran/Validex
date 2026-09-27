"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { WalletButton } from "../../components/WalletButton";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  decideMerchantApplication,
  listAuditEvents,
  listMerchantApplications,
  AuditEvent,
  MerchantProfile,
} from "../../lib/merchantApi";
import {
  accountExists, chainConfigured, loadChain, registerMerchantInstruction, sendWalletTransaction,
} from "../../lib/validexChain";

export default function AdminPage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [applications, setApplications] = useState<MerchantProfile[]>([]);
  const [verified, setVerified] = useState<MerchantProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [securityEvents, setSecurityEvents] = useState<AuditEvent[]>([]);
  const [message, setMessage] = useState<string | null>(null);

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
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Başvurular alınamadı."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [walletAddress]);

  async function decide(merchant: MerchantProfile, approved: boolean) {
    if (!walletAddress) return;
    try {
      if (approved && !chainConfigured()) throw new Error("Önce zincir programı ve USDC mint ayarlanmalı; zincir kaydı olmadan onay verilmiyor.");
      const decided = await decideMerchantApplication(walletAddress, merchant.id, approved);
      setApplications((current) => current.filter((item) => item.id !== merchant.id));
      if (approved) {
        setVerified((current) => [...current, decided]);
        await syncMerchant(decided, walletAddress);
        setMessage(`${merchant.business_name} API'de ve zincirde onaylandı.`);
      } else setMessage(`${merchant.business_name} başvurusu reddedildi.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Karar veya zincir kaydı tamamlanamadı.");
    }
  }

  async function syncMerchant(merchant: MerchantProfile, adminAddress = walletAddress) {
    if (!adminAddress) throw new Error("Yönetici cüzdanını bağlayın.");
    const config = await loadChain();
    const { instruction, merchant: merchantPda } = await registerMerchantInstruction(config, adminAddress, merchant.wallet_address);
    if (!await accountExists(config, merchantPda)) {
      await sendWalletTransaction(config, adminAddress, instruction, merchantPda);
    }
  }

  return (
    <main className="dashboardPage adminPage">
      <header className="dashboardHeader"><div className="dashboardShell adminNav"><Link className="brand" href="/">validex<span>.</span></Link><span>Yönetim merkezi</span><WalletButton onAddressChange={setWalletAddress} /></div></header>
      <section className="dashboardShell adminHero"><div><p className="eyebrow">YÖNETİCİ PANELİ</p><h1>İşletme güveni burada başlar.</h1><p>Başvuruları inceleyin, yalnızca doğrulanmış yerel işletmelere kampanya yayımlama yetkisi verin.</p></div><div className="adminMetric"><span>BEKLEYEN BAŞVURU</span><strong>{applications.length}</strong><small>Solana cüzdan kimliğiyle bağlı</small></div></section>
      {message ? <div className="dashboardShell notice" role="status">{message}<button onClick={() => setMessage(null)}>×</button></div> : null}
      <section className="dashboardShell adminApplications">
        <div className="contentHeading"><div><p className="eyebrow">DOĞRULAMA KUYRUĞU</p><h2>İşletme başvuruları</h2></div><StatusBadge tone={walletAddress ? "success" : "warning"}>{walletAddress ? "CÜZDAN BAĞLI" : "YÖNETİCİ CÜZDANI GEREKLİ"}</StatusBadge></div>
        {!walletAddress ? <div className="emptyState">Başvuruları görmek için `VALIDEX_ADMIN_WALLET` ile tanımlı yönetici cüzdanını bağlayın.</div> : loading ? <div className="emptyState">Başvurular yükleniyor…</div> : applications.length ? <div className="applicationList">{applications.map((merchant) => <article key={merchant.id}><div><StatusBadge tone="warning">BEKLİYOR</StatusBadge><h3>{merchant.business_name}</h3><p>{merchant.description || "Açıklama eklenmemiş."}</p><address>{merchant.address}</address><small>{merchant.wallet_address.slice(0, 6)}…{merchant.wallet_address.slice(-6)} · {new Date(merchant.created_at).toLocaleDateString("tr-TR")}</small></div><div className="decisionActions"><button onClick={() => void decide(merchant, false)} type="button">Reddet</button><button className="approve" onClick={() => void decide(merchant, true)} type="button">Onayla</button></div></article>)}</div> : <div className="emptyState">Bekleyen işletme başvurusu bulunmuyor.</div>}
      </section>
      {walletAddress && verified.length ? <section className="dashboardShell adminApplications"><div className="contentHeading"><div><p className="eyebrow">ZİNCİR KAYDI</p><h2>Onaylı işletmeler</h2></div></div><div className="applicationList">{verified.map((merchant) => <article key={merchant.id}><div><h3>{merchant.business_name}</h3><small>{merchant.wallet_address}</small></div><div className="decisionActions"><button className="approve" disabled={!chainConfigured()} onClick={() => void syncMerchant(merchant).then(() => setMessage("Zincir kaydı doğrulandı.")).catch((error) => setMessage(error instanceof Error ? error.message : "Zincir kaydı başarısız."))} type="button">Zincir kaydını doğrula</button></div></article>)}</div></section> : null}
      {walletAddress ? <section className="dashboardShell adminApplications"><div className="contentHeading"><div><p className="eyebrow">GÜVENLİK</p><h2>Şüpheli doğrulamalar</h2></div><StatusBadge tone={securityEvents.length ? "warning" : "success"}>{securityEvents.length} kayıt</StatusBadge></div><div className="applicationList">{securityEvents.length ? securityEvents.map((event) => <article key={event.id}><div><strong>{event.action}</strong><p>{event.entity_type}: {event.entity_id}</p><small>{event.actor_wallet ?? "Bilinmeyen cüzdan"} · {new Date(event.created_at).toLocaleString("tr-TR")}</small></div></article>) : <div className="emptyState">Şüpheli QR denemesi kaydedilmedi.</div>}</div></section> : null}
      {walletAddress ? <section className="dashboardShell adminApplications"><div className="contentHeading"><div><p className="eyebrow">DENETİM</p><h2>Son işlemler</h2></div></div><div className="applicationList">{auditEvents.map((event) => <article key={event.id}><div><strong>{event.action}</strong><p>{event.entity_type}: {event.entity_id}</p><small>{event.actor_wallet ?? "Bilinmeyen cüzdan"} · {new Date(event.created_at).toLocaleString("tr-TR")}</small></div></article>)}</div></section> : null}
    </main>
  );
}
