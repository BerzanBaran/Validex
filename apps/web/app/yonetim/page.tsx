"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { WalletButton } from "../../components/WalletButton";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  decideMerchantApplication,
  listMerchantApplications,
  MerchantProfile,
} from "../../lib/merchantApi";

export default function AdminPage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [applications, setApplications] = useState<MerchantProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      setApplications([]);
      return;
    }
    let active = true;
    setLoading(true);
    listMerchantApplications(walletAddress)
      .then((items) => { if (active) setApplications(items); })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Başvurular alınamadı."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [walletAddress]);

  async function decide(merchant: MerchantProfile, approved: boolean) {
    if (!walletAddress) return;
    try {
      await decideMerchantApplication(walletAddress, merchant.id, approved);
      setApplications((current) => current.filter((item) => item.id !== merchant.id));
      setMessage(`${merchant.business_name} başvurusu ${approved ? "onaylandı" : "reddedildi"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Karar kaydedilemedi.");
    }
  }

  return (
    <main className="dashboardPage adminPage">
      <header className="dashboardHeader"><div className="dashboardShell adminNav"><Link className="brand" href="/">validex<span>.</span></Link><span>Yönetim merkezi</span><WalletButton onAddressChange={setWalletAddress} /></div></header>
      <section className="dashboardShell adminHero"><div><p className="eyebrow">YÖNETİCİ PANELİ</p><h1>İşletme güveni burada başlar.</h1><p>Başvuruları inceleyin, yalnızca doğrulanmış yerel işletmelere kampanya yayımlama yetkisi verin.</p></div><div className="adminMetric"><span>BEKLEYEN BAŞVURU</span><strong>{applications.length}</strong><small>Solana cüzdan kimliğiyle bağlı</small></div></section>
      {message ? <div className="dashboardShell notice" role="status">{message}<button onClick={() => setMessage(null)}>×</button></div> : null}
      <section className="dashboardShell adminApplications">
        <div className="contentHeading"><div><p className="eyebrow">DOĞRULAMA KUYRUĞU</p><h2>İşletme başvuruları</h2></div><StatusBadge tone={walletAddress ? "success" : "warning"}>{walletAddress ? "CÜZDAN BAĞLI" : "YÖNETİCİ CÜZDANI GEREKLİ"}</StatusBadge></div>
        {!walletAddress ? <div className="emptyState">Başvuruları görmek için `VALIDEX_ADMIN_WALLETS` içinde tanımlı yönetici cüzdanını bağlayın.</div> : loading ? <div className="emptyState">Başvurular yükleniyor…</div> : applications.length ? <div className="applicationList">{applications.map((merchant) => <article key={merchant.id}><div><StatusBadge tone="warning">BEKLİYOR</StatusBadge><h3>{merchant.business_name}</h3><p>{merchant.description || "Açıklama eklenmemiş."}</p><address>{merchant.address}</address><small>{merchant.wallet_address.slice(0, 6)}…{merchant.wallet_address.slice(-6)} · {new Date(merchant.created_at).toLocaleDateString("tr-TR")}</small></div><div className="decisionActions"><button onClick={() => void decide(merchant, false)} type="button">Reddet</button><button className="approve" onClick={() => void decide(merchant, true)} type="button">Onayla</button></div></article>)}</div> : <div className="emptyState">Bekleyen işletme başvurusu bulunmuyor.</div>}
      </section>
    </main>
  );
}
