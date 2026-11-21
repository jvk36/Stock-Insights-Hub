interface EarningsPoint { date: string; ttmEps?: number | null }
const DAY = 86_400_000;

/** Interpolate reported quarterly TTM observations without extrapolating or bridging missing quarters. */
export function earningsFairValues(
  dates: string[], history: EarningsPoint[], pe: number,
): (number | null)[] {
  const unavailable = dates.map(() => null);
  if (!dates.length) return unavailable;
  const nodes = [...new Map(history.map(p => [p.date, p])).values()]
    .map(p => ({ t: Date.parse(p.date), value: p.ttmEps }))
    .filter(p => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
  const times = dates.map(Date.parse);
  if (times.some(t => !Number.isFinite(t))) return unavailable;
  const start = Math.min(...times), end = Math.max(...times);
  const left = nodes.findLastIndex(p => p.t <= start);
  const right = nodes.findIndex(p => p.t >= end);
  if (left < 0 || right < 0) return unavailable;
  const covered = nodes.slice(left, right + 1);
  if (covered.length < 2 || covered.some((p, i) =>
    p.value == null || !Number.isFinite(p.value) || p.value <= 0
    || (i > 0 && (p.t - covered[i - 1].t) / DAY > 115),
  )) return unavailable;
  return times.map(t => {
    const i = covered.findIndex(p => p.t >= t);
    if (i === 0) return covered[0].value! * pe;
    const a = covered[i - 1], b = covered[i];
    const x = (t - a.t) / (b.t - a.t);
    // Cubic Hermite interpolation with zero endpoint tangents: continuous first
    // derivative at quarter boundaries, and no overshoot between observations.
    const smooth = x * x * (3 - 2 * x);
    return (a.value! + (b.value! - a.value!) * smooth) * pe;
  });
}
