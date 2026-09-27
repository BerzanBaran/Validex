type StatusBadgeProps = {
  tone?: "success" | "warning" | "neutral" | "danger";
  children: React.ReactNode;
};

export function StatusBadge({ tone = "neutral", children }: StatusBadgeProps) {
  return <span className={`statusBadge ${tone}`}>{children}</span>;
}
