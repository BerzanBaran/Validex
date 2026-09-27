"use client";

import Link from "next/link";
import { HeroTicketScene } from "../components/HeroTicketScene";
import { WalletButton } from "../components/WalletButton";
import { useMarketplace } from "../lib/marketplace";

export default function Home() {
  const marketplace = useMarketplace();
  const campaigns = marketplace.campaigns.filter((campaign) =>
    campaign.status === "published" && campaign.sold < campaign.stock &&
    new Date(campaign.expiresAt).getTime() > Date.now(),
  ).slice(0, 3);

  return (
    <main className="homePage">
      <div className="announcement"><span className="announcementDot" /> Mahallenin güzel fırsatları artık zincir üstünde <span aria-hidden="true">✦</span> Solana Devnet</div>
      <nav className="nav shell" aria-label="Ana menü">
        <Link className="brand" href="/">validex<span>.</span></Link>
        <div className="navLinks"><a href="#campaigns">Fırsatlar</a><a href="#how">Nasıl çalışır?</a><Link href="/isletme">İşletmeler için</Link><WalletButton /></div>
      </nav>

      <section className="hero shell">
        <div className="heroCopy">
          <p className="eyebrow"><span className="sparkle">✳</span> YERELİN İYİ HALİ, CÜZDANINDA</p>
          <h1>Şehir senin.<br /><em>Güzel anlar</em><br />yakınında.</h1>
          <p className="lead">Sevdiğin semtte yeni bir masa, bir fincan kahve, küçük bir keşif. Yerel işletmelerin kuponlarını bul; cüzdanınla güvenle al, QR kodunla kolayca kullan.</p>
          <div className="heroActions"><Link className="primary" href="/musteri">Fırsatları keşfet <span aria-hidden="true">↗</span></Link><Link className="heroTextLink" href="/isletme">İşletmeni öne çıkar <span aria-hidden="true">→</span></Link></div>
          <div className="heroProof"><span className="proofMark">✦</span><span>Yerel işletmeler <b>×</b> gerçek deneyimler <b>×</b> Solana</span></div>
        </div>
        <div className="heroArt">
          <span className="heroArtLabel">DİJİTAL KUPON / GERÇEK AN</span>
          <HeroTicketScene />
          <div className="floatNote"><span aria-hidden="true">✷</span><div><strong>Bir sonraki favorin</strong><small>Belki de köşeyi dönünce.</small></div></div>
          <span className="artCounter">01 <span>/</span> VALIDEX DENEYİMİ</span>
        </div>
      </section>

      <div className="ticker" aria-hidden="true"><div>KEŞFET <span>✳</span> DESTEKLE <span>✳</span> DENEYİMLE <span>✳</span> KEŞFET <span>✳</span> DESTEKLE <span>✳</span> DENEYİMLE <span>✳</span></div></div>

      <section className="campaignSection" id="campaigns"><div className="shell">
        <div className="sectionTitle"><div><p className="eyebrow">MAHALLENDEN SEÇKİLER</p><h2>İyi şeyler <em>yakında.</em></h2><p>Bugün kendine küçük bir iyilik yap.</p></div><Link className="filter" href="/musteri">Tüm kampanyalar <span aria-hidden="true">↗</span></Link></div>
        <div className="grid">
          {campaigns.map((campaign, index) => <article className="campaignCard" key={campaign.id}>
            <div className={`cardVisual ${campaign.accent}`}><span className="cardLocation">{campaign.area}</span><span className="cardNumber">0{index + 1} / VALIDEX</span><div className="visualPrice"><b>{campaign.priceUsdc}</b><small>USDC</small></div><div className="visualArc" aria-hidden="true" /></div>
            <div className="cardCopy"><p>{campaign.merchant}</p><h3>{campaign.title}</h3><div><span>{campaign.originalValueUsdc} USDC değerinde</span><Link className="roundLink" href={`/kampanyalar/${campaign.id}`} aria-label={`${campaign.title} ayrıntısı`}>↗</Link></div></div>
          </article>)}
          {marketplace.campaignError ? <div className="emptyState" role="alert">Kampanyalar yüklenemedi. <Link href="/musteri">Tekrar dene ↗</Link></div> : marketplace.ready && !campaigns.length ? <div className="emptyState">Şu anda yayında kampanya yok. Yeni fırsatlar için tekrar uğra.</div> : null}
        </div>
      </div></section>

      <section className="how shell" id="how"><div className="howIntro"><p className="eyebrow">KOLAY OLAN GÜZELDİR</p><h2>Üç adım.<br /><em>Bir sürü güzel an.</em></h2><p>Teknoloji arka planda; keyifli deneyim tam önünde.</p></div><div className="steps">
        <div><span>01 / KEŞFET</span><div className="stepGlyph">⌕</div><h3>Sana yakın olanı bul</h3><p>Mahallendeki bağımsız işletmelerin güncel fırsatlarını incele.</p></div>
        <div><span>02 / AL</span><div className="stepGlyph">↗</div><h3>Cüzdanınla onayla</h3><p>USDC ödemesi yalnızca Solflare veya Phantom onayınla gerçekleşir.</p></div>
        <div><span>03 / YAŞA</span><div className="stepGlyph">✳</div><h3>QR’ını göster, keyfini çıkar</h3><p>Tek kullanımlık kuponunu işletmede doğrulat ve anın tadını çıkar.</p></div>
      </div></section>

      <section className="joinBand"><div className="shell joinInner"><div><p className="eyebrow">İŞLETMELER İÇİN</p><h2>Mahallenin yeni<br /><em>favorisi ol.</em></h2></div><div><p>İyi bir teklifi doğru insanlarla buluştur. Kampanyanı oluştur, kuponlarını yönet, misafirlerini karşıla.</p><Link className="primary" href="/isletme">İşletme paneline git <span aria-hidden="true">↗</span></Link></div></div></section>
      <footer className="homeFooter shell"><Link className="brand" href="/">validex<span>.</span></Link><span>Yerel keşif için küçük bir başlangıç. Solana Devnet üzerinde geliştirilir.</span><Link href="/musteri">Keşfet ↗</Link></footer>
    </main>
  );
}
