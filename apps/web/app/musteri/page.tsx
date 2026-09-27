"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { DashboardHeader } from "../../components/DashboardHeader";
import { useMarketplace } from "../../lib/marketplace";
import { useSolanaBalances } from "../../lib/solanaRpc";

export default function CustomerDashboard() {
  const marketplace = useMarketplace();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const balances = useSolanaBalances(walletAddress);

  const campaigns = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return marketplace.campaigns.filter(
      (campaign) =>
        campaign.status === "published" &&
        campaign.sold < campaign.stock &&
        new Date(campaign.expiresAt).getTime() > Date.now() &&
        (!normalized ||
          `${campaign.title} ${campaign.merchant} ${campaign.area}`
            .toLocaleLowerCase("tr-TR")
            .includes(normalized)),
    );
  }, [marketplace.campaigns, query]);

  const myVouchers = marketplace.vouchers.filter(
    (voucher) => walletAddress && voucher.ownerWallet === walletAddress,
  );

  function purchase(campaignId: string) {
    if (!walletAddress) {
      setNotice("Satın almak için önce Solflare veya Phantom cüzdanınızı bağlayın.");
      return;
    }
    try {
      const voucher = marketplace.purchaseCampaign(campaignId, walletAddress);
      setNotice(`${voucher.title} kuponu demo olarak satın alındı ve Kuponlarım'a eklendi.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Satın alma tamamlanamadı.");
    }
  }

  return (
    <main className="dashboardPage customerDashboard">
      <DashboardHeader role="customer" onAddressChange={setWalletAddress} />
      <section className="dashboardShell dashboardHero">
        <div>
          <p className="eyebrow">MÜŞTERİ PANELİ</p>
          <h1>Bugünün güzel bahanesini bul.</h1>
          <p>Yerel işletmelerin kuponlarını keşfet, cüzdanınla satın al ve tek kullanımlık kodunu sakla.</p>
        </div>
        <div className="balanceCard">
          <span>DEVNET CÜZDAN BAKİYESİ</span>
          <strong>{!walletAddress ? "Cüzdan bağlı değil" : balances.status === "loading" ? "Okunuyor…" : balances.usdcBalance === null ? "USDC mint bekleniyor" : `${balances.usdcBalance.toFixed(2)} USDC`}</strong>
          <small>{balances.status === "error" ? "Solana RPC bağlantısı kurulamadı." : walletAddress && balances.solBalance !== null ? `${balances.solBalance.toFixed(4)} SOL · ${balances.network}` : balances.network}</small>
        </div>
      </section>

      {notice ? <div className="dashboardShell notice" role="status">{notice}<button onClick={() => setNotice(null)}>×</button></div> : null}

      <section className="dashboardShell dashboardContent">
        <div className="contentHeading">
          <div><p className="eyebrow">KEŞFET</p><h2>Satın alınabilir kuponlar</h2></div>
          <input
            aria-label="Kampanyalarda ara"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="İşletme, semt veya kampanya ara"
            type="search"
            value={query}
          />
        </div>
        <div className="marketGrid">
          {campaigns.map((campaign) => (
            <article className="marketCard" key={campaign.id}>
              <div className={`marketVisual ${campaign.accent}`}>
                <span>{campaign.area}</span>
                <div><b>{campaign.priceUsdc}</b><small>USDC</small></div>
              </div>
              <div className="marketCopy">
                <p>{campaign.merchant} · {campaign.category}</p>
                <h3>{campaign.title}</h3>
                <p className="description">{campaign.description}</p>
                <div className="stockLine"><span>{campaign.originalValueUsdc} USDC değerinde</span><span>{campaign.stock - campaign.sold} kaldı</span></div>
                <div className="cardActions"><Link className="secondaryButton" href={`/kampanyalar/${campaign.id}`}>Detaylar</Link><button className="actionButton" onClick={() => purchase(campaign.id)} type="button">Hızlı al</button></div>
              </div>
            </article>
          ))}
        </div>
        {!campaigns.length ? <div className="emptyState">Aramanıza uygun aktif kampanya bulunamadı.</div> : null}
      </section>

      <section className="dashboardShell vouchersSection">
        <div className="contentHeading"><div><p className="eyebrow">CÜZDANIM</p><h2>Kuponlarım</h2></div><span>{myVouchers.length} aktif kupon</span></div>
        {!walletAddress ? (
          <div className="emptyState">Kuponlarınızı görmek için Solflare veya Phantom cüzdanınızı bağlayın.</div>
        ) : myVouchers.length ? (
          <div className="voucherList">
            {myVouchers.map((voucher) => (
              <Link className="voucherRow" href={`/musteri/kuponlar/${voucher.id}`} key={voucher.id}>
                <div><span className="statusPill">AKTİF</span><h3>{voucher.title}</h3><p>{voucher.merchant} · Son kullanım {voucher.expiresAt}</p></div>
                <div className="voucherCode"><small>TEK KULLANIMLIK KOD</small><strong>{voucher.code}</strong></div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="emptyState">Henüz bir kupon satın almadınız.</div>
        )}
      </section>

      <div className="demoBanner">Demo modu: Bu ekranda henüz gerçek USDC transferi yapılmaz.</div>
    </main>
  );
}
