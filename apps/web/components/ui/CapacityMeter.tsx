type CapacityMeterProps = { sold: number; stock: number };

export function CapacityMeter({ sold, stock }: CapacityMeterProps) {
  const percentage = stock > 0 ? Math.min(100, Math.round((sold / stock) * 100)) : 0;
  return (
    <div className="capacityMeter">
      <div><span>Satılan {sold}</span><span>{Math.max(0, stock - sold)} kupon kaldı</span></div>
      <div className="capacityTrack" role="progressbar" aria-label="Kupon kapasitesi" aria-valuemin={0} aria-valuemax={stock} aria-valuenow={sold}>
        <span style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
