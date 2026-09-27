"use client";

import Link from "next/link";
import { WalletButton } from "../components/WalletButton";
import { useMarketplace } from "../lib/marketplace";

export default function Home() {
  const marketplace = useMarketplace();
  const campaigns = marketplace.campaigns.filter((campaign) =>
    campaign.status === "published" && campaign.sold < campaign.stock &&
    new Date(campaign.expiresAt).getTime() > Date.now(),
  ).slice(0, 3);
  const featured = campaigns[0];
  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href="#">validex<span>.</span></a>
        <div className="navLinks">
          <a href="#campaigns">Kampanyalar</a>
          <Link href="/musteri">Müşteri paneli</Link>
          <Link href="/isletme">İşletme paneli</Link>
          <WalletButton />
        </div>
      </nav>

      <section className="hero shell">
        <div className="heroCopy">
          <p className="eyebrow">SOLANA DEVNET · YERELİ KEŞFET</p>
          <h1>Şehrin iyi köşeleri,<br /><em>daha yakın.</em></h1>
          <p className="lead">
            Mahallendeki bağımsız işletmelerden kupon al. Solflare veya Phantom ile öde,
            QR kodunu göster, anında kullan.
          </p>
          <div className="heroActions">
            <Link className="primary" href="/musteri">Fırsatları keşfet <span>↗</span></Link>
            <span className="trust"><b>●</b> Saklamasız ve zincir üstü</span>
          </div>
        </div>
        <div className="heroCard" aria-label={featured ? "Öne çıkan kampanya" : "Örnek kupon tasarımı"}>
          <div className="ticketTop">
            <span className="tag">{featured ? "GÜNCEL KAMPANYA" : "ÖRNEK TASARIM"}</span>
            <span className="ticketIcon">☕</span>
          </div>
          <div className="ticketBody">
            <p>{featured?.merchant ?? "Yerel işletmeler"}</p>
            <h2>{featured?.title ?? "Yeni fırsatlar yakında."}</h2>
            <div className="ticketPrice"><strong>{featured?.priceUsdc ?? "—"}</strong><span>USDC<br /><small>{featured ? `${featured.originalValueUsdc} USDC yerine` : "Kampanyaları keşfet"}</small></span></div>
          </div>
          <div className="ticketFoot"><span>{featured?.area ?? "Solana Devnet"}</span><span>{featured ? `${featured.stock - featured.sold} kupon kaldı` : "Canlı kampanya bekleniyor"}</span></div>
        </div>
      </section>

      <section className="campaignSection" id="campaigns">
        <div className="shell">
          <div className="sectionTitle">
            <div><p className="eyebrow">YAKININDAKİLER</p><h2>Bugün ne keşfediyoruz?</h2></div>
            <Link className="filter" href="/musteri">Tüm kampanyalar →</Link>
          </div>
          <div className="grid">
            {campaigns.map((campaign) => (
              <article className="campaignCard" key={campaign.id}>
                <div className={`cardVisual ${campaign.accent}`}>
                  <span>{campaign.area}</span><b>{campaign.priceUsdc}</b><small>USDC</small>
                </div>
                <div className="cardCopy">
                  <p>{campaign.merchant}</p><h3>{campaign.title}</h3>
                  <div><span>{campaign.originalValueUsdc} USDC değerinde</span><Link className="roundLink" href={`/kampanyalar/${campaign.id}`} aria-label={`${campaign.title} ayrıntısı`}>→</Link></div>
                </div>
              </article>
            ))}
            {marketplace.campaignError ? <div className="emptyState" role="alert">Kampanyalar yüklenemedi. <Link href="/musteri">Tekrar dene →</Link></div> : marketplace.ready && !campaigns.length ? <div className="emptyState">Şu anda yayında kampanya yok.</div> : null}
          </div>
        </div>
      </section>

      <section className="how shell" id="how">
        <p className="eyebrow">ÜÇ ADIMDA</p>
        <h2>Kod değil, güzel anılar biriktir.</h2>
        <div className="steps">
          <div><span>01</span><h3>Fırsatı seç</h3><p>Şehrindeki bağımsız işletmeleri ve güncel kampanyaları keşfet.</p></div>
          <div><span>02</span><h3>Cüzdanınla onayla</h3><p>USDC ödemen Solflare veya Phantom cüzdanından, yalnızca senin onayınla gerçekleşir.</p></div>
          <div><span>03</span><h3>QR'ı göster</h3><p>Tek kullanımlık kuponunu işletmede okut ve keyfini çıkar.</p></div>
        </div>
      </section>
    </main>
  );
}
