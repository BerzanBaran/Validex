export type TransactionPhase = "idle" | "preparing" | "confirmed" | "failed";

const LABELS: Record<Exclude<TransactionPhase, "idle">, { title: string; detail: string }> = {
  preparing: { title: "Kupon hazırlanıyor", detail: "Demo kaydı oluşturuluyor ve stok kontrol ediliyor." },
  confirmed: { title: "Kupon hazır", detail: "Kupon cüzdanınıza eklendi. QR kodunu kullanabilirsiniz." },
  failed: { title: "İşlem tamamlanamadı", detail: "Bilgileri kontrol edip yeniden deneyin." },
};

export function TransactionFeedback({ phase, message }: { phase: TransactionPhase; message?: string }) {
  if (phase === "idle") return null;
  const content = LABELS[phase];
  return (
    <div className={`transactionFeedback ${phase}`} role="status">
      <span className="transactionIcon">{phase === "preparing" ? "···" : phase === "confirmed" ? "✓" : "!"}</span>
      <div><strong>{content.title}</strong><p>{message ?? content.detail}</p></div>
    </div>
  );
}
