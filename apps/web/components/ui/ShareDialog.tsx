"use client";

import { useState } from "react";

export function ShareDialog({ title, url, onClose }: { title: string; url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  async function share() {
    if (navigator.share) await navigator.share({ title, url });
    else await copy();
  }

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="shareDialog" role="dialog" aria-modal="true" aria-label="Share offer" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modalClose" onClick={onClose} aria-label="Close" type="button">×</button>
        <span className="shareGlyph">↗</span>
        <p className="eyebrow">SHARE THIS OFFER</p>
        <h2>{title}</h2>
        <p>Customers can open this link to see the offer details.</p>
        <div className="shareUrl"><span>{url}</span><button onClick={copy} type="button">{copied ? "Copied" : "Copy"}</button></div>
        <button className="actionButton" onClick={share} type="button">Open share menu</button>
      </section>
    </div>
  );
}
