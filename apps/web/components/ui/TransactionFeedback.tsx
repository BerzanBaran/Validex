export type TransactionPhase = "idle" | "preparing" | "confirmed" | "failed";

const LABELS: Record<Exclude<TransactionPhase, "idle">, { title: string; detail: string }> = {
  preparing: { title: "Watching on-chain transaction", detail: "Waiting for USDC payment and API verification." },
  confirmed: { title: "Voucher ready", detail: "Chain and API verification are complete. Your QR code is ready." },
  failed: { title: "Transaction incomplete", detail: "Check the details and try again." },
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
