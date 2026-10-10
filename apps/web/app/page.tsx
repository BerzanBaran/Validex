"use client";

import Link from "next/link";
import { HeroTicketScene } from "../components/HeroTicketScene";
import { ThemeToggle } from "../components/ThemeToggle";
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
      <div className="announcement"><span className="announcementDot" /> Better local moments, powered by Solana <span aria-hidden="true">✦</span> Devnet preview</div>
      <nav className="nav shell" aria-label="Main navigation">
        <Link className="brand" href="/">validex<span>.</span></Link>
        <div className="navLinks"><a href="#campaigns">Explore offers</a><a href="#how">How it works</a><Link href="/isletme">For merchants</Link></div>
        <div className="navActions"><ThemeToggle /><WalletButton /></div>
      </nav>

      <section className="hero shell">
        <div className="heroCopy">
          <p className="eyebrow"><span className="sparkle">✳</span> YOUR CITY, YOUR NEXT GREAT FIND</p>
          <h1>Your city.<br /><em>Better moments</em><br />around the corner.</h1>
          <p className="lead">A new table, a great coffee, a little discovery. Find offers from independent local businesses, pay securely with your wallet, and redeem with a simple QR code.</p>
          <div className="heroActions"><Link className="primary" href="/musteri">Explore offers <span aria-hidden="true">↗</span></Link><Link className="heroTextLink" href="/isletme">Grow your business <span aria-hidden="true">→</span></Link></div>
          <div className="heroProof"><span className="proofMark">✦</span><span>Local businesses <b>×</b> real experiences <b>×</b> Solana</span></div>
        </div>
        <div className="heroArt">
          <HeroTicketScene />
          <span className="heroArtLabel">DIGITAL VOUCHER / REAL MOMENT</span>
          <div className="floatNote"><span aria-hidden="true">✷</span><div><strong>Your next favorite spot</strong><small>Just around the corner.</small></div></div>
          <span className="artCounter">01 <span>/</span> THE VALIDEX EXPERIENCE</span>
        </div>
      </section>

      <div className="ticker" aria-hidden="true"><div>DISCOVER <span>✳</span> SUPPORT LOCAL <span>✳</span> ENJOY <span>✳</span> DISCOVER <span>✳</span> SUPPORT LOCAL <span>✳</span> ENJOY <span>✳</span></div></div>

      <section className="campaignSection" id="campaigns"><div className="shell">
        <div className="sectionTitle"><div><p className="eyebrow">PICKS FROM YOUR NEIGHBORHOOD</p><h2>Good things <em>nearby.</em></h2><p>Make room for a little treat today.</p></div><Link className="filter" href="/musteri">All offers <span aria-hidden="true">↗</span></Link></div>
        <div className="grid">
          {campaigns.map((campaign, index) => <article className="campaignCard" key={campaign.id}>
            <div className={`cardVisual ${campaign.accent}`}><span className="cardLocation">{campaign.area}</span><span className="cardNumber">0{index + 1} / VALIDEX</span><div className="visualPrice"><b>{campaign.priceUsdc}</b><small>USDC</small></div><div className="visualArc" aria-hidden="true" /></div>
            <div className="cardCopy"><p>{campaign.merchant}</p><h3>{campaign.title}</h3><div><span>Worth {campaign.originalValueUsdc} USDC</span><Link className="roundLink" href={`/kampanyalar/${campaign.id}`} aria-label={`Details for ${campaign.title}`}>↗</Link></div></div>
          </article>)}
          {marketplace.campaignError ? <div className="emptyState" role="alert">Offers could not be loaded. <Link href="/musteri">Try again ↗</Link></div> : !marketplace.ready ? <div className="emptyState loadingState" aria-live="polite">Loading nearby offers…</div> : !campaigns.length ? <div className="emptyState">No live offers yet. Check back soon for new finds.</div> : null}
        </div>
      </div></section>

      <section className="how shell" id="how"><div className="howIntro"><p className="eyebrow">SIMPLE FEELS BETTER</p><h2>Three steps.<br /><em>So many good moments.</em></h2><p>The technology stays in the background. The experience is all yours.</p></div><div className="steps">
        <div><span>01 / DISCOVER</span><div className="stepGlyph">⌕</div><h3>Find something nearby</h3><p>Browse fresh offers from independent businesses in your neighborhood.</p></div>
        <div><span>02 / BUY</span><div className="stepGlyph">↗</div><h3>Approve with your wallet</h3><p>Your USDC payment happens only with your Solflare or Phantom approval.</p></div>
        <div><span>03 / ENJOY</span><div className="stepGlyph">✳</div><h3>Show your QR, enjoy the moment</h3><p>Redeem your single-use voucher at the business and make it memorable.</p></div>
      </div></section>

      <section className="joinBand"><div className="shell joinInner"><div><p className="eyebrow">FOR MERCHANTS</p><h2>Become the next<br /><em>local favorite.</em></h2></div><div><p>Put a great offer in front of the right people. Create campaigns, manage vouchers, and welcome new regulars.</p><Link className="primary" href="/isletme">Open merchant dashboard <span aria-hidden="true">↗</span></Link></div></div></section>
      <footer className="homeFooter shell"><Link className="brand" href="/">validex<span>.</span></Link><span>A small start for local discovery. Built on Solana Devnet.</span><Link href="/musteri">Explore ↗</Link></footer>
    </main>
  );
}
