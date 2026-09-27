import Link from "next/link";
import { WalletButton } from "../components/WalletButton";

const campaigns = [
  {
    merchant: "Kavurucu No.7",
    title: "İki nitelikli kahve, tek fiyat",
    area: "Kadıköy",
    price: "5 USDC",
    value: "10 USDC değerinde",
    accent: "coffee",
  },
  {
    merchant: "Minoa Kitchen",
    title: "Günün tatlısı ve filtre kahve",
    area: "Beşiktaş",
    price: "6 USDC",
    value: "12 USDC değerinde",
    accent: "berry",
  },
  {
    merchant: "Atölye Brunch",
    title: "Hafta içi öğrenci kahvaltısı",
    area: "Şişli",
    price: "8 USDC",
    value: "15 USDC değerinde",
    accent: "lime",
  },
];

export default function Home() {
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
        <div className="heroCard" aria-label="Örnek kupon">
          <div className="ticketTop">
            <span className="tag">BUGÜNÜN SEÇİMİ</span>
            <span className="ticketIcon">☕</span>
          </div>
          <div className="ticketBody">
            <p>Kavurucu No.7</p>
            <h2>İki kahve,<br />tek fiyat.</h2>
            <div className="ticketPrice"><strong>5</strong><span>USDC<br /><small>10 USDC yerine</small></span></div>
          </div>
          <div className="ticketFoot"><span>Kadıköy · 850 m</span><span>42 kupon kaldı</span></div>
        </div>
      </section>

      <section className="campaignSection" id="campaigns">
        <div className="shell">
          <div className="sectionTitle">
            <div><p className="eyebrow">YAKININDAKİLER</p><h2>Bugün ne keşfediyoruz?</h2></div>
            <button className="filter">Tümü · İstanbul⌄</button>
          </div>
          <div className="grid">
            {campaigns.map((campaign, index) => (
              <article className="campaignCard" key={campaign.title}>
                <div className={`cardVisual ${campaign.accent}`}>
                  <span>{campaign.area}</span><b>{campaign.price.split(" ")[0]}</b><small>USDC</small>
                </div>
                <div className="cardCopy">
                  <p>{campaign.merchant}</p><h3>{campaign.title}</h3>
                  <div><span>{campaign.value}</span><Link className="roundLink" href={`/kampanyalar/${["cmp_kavurucu_7", "cmp_minoa_kitchen", "cmp_atolye_brunch"][index]}`} aria-label={`${campaign.title} ayrıntısı`}>→</Link></div>
                </div>
              </article>
            ))}
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
