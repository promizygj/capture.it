import { useMemo, useState } from 'react';

type Day = { day: string; passed: number; failed: number; skipped: number };

const SERIES = [
  { key: 'passed', label: 'Passed', color: 'var(--color-good)' },
  { key: 'failed', label: 'Failed', color: 'var(--color-bad)' },
  { key: 'skipped', label: 'Skipped', color: 'var(--color-skip)' },
] as const;

function niceMax(v: number) {
  if (v <= 5) return 5;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / p) * p;
}

/** Stacked daily bars of test outcomes. Status colours + legend + hover tooltip + table view. */
export function TrendChart({ data, days }: { data: Day[]; days: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const series = useMemo(() => {
    const map = new Map(data.map((d) => [d.day, d]));
    const out: Day[] = [];
    const n = Math.min(days, 60);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      out.push(map.get(d) ?? { day: d, passed: 0, failed: 0, skipped: 0 });
    }
    return out;
  }, [data, days]);

  const W = 720, H = 220, PL = 36, PR = 8, PT = 10, PB = 24;
  const max = niceMax(Math.max(1, ...series.map((d) => d.passed + d.failed + d.skipped)));
  const slot = (W - PL - PR) / series.length;
  const barW = Math.max(2, Math.min(28, slot - 2));
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / max);
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(series.length / 8);
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const h = hover !== null ? series[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-4 text-xs text-ink-2">
          {SERIES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
        <button className="text-xs text-primary hover:underline" onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>
      {showTable ? (
        <div className="max-h-64 overflow-auto">
          <table className="table-base">
            <thead><tr><th>Day</th><th>Passed</th><th>Failed</th><th>Skipped</th></tr></thead>
            <tbody>
              {series.filter((d) => d.passed + d.failed + d.skipped > 0).map((d) => (
                <tr key={d.day}><td>{fmt(d.day)}</td><td className="tabular-nums">{d.passed}</td><td className="tabular-nums">{d.failed}</td><td className="tabular-nums">{d.skipped}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Daily test results over the last ${days} days`} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={t === 0 ? 1 : 0.5} />
                <text x={PL - 6} y={y(t) + 3.5} textAnchor="end" className="fill-ink-3 text-[10px] tabular-nums">{Math.round(t)}</text>
              </g>
            ))}
            {series.map((d, i) => {
              const x = PL + i * slot + (slot - barW) / 2;
              let acc = 0;
              const segs = SERIES.map((s) => {
                const v = d[s.key];
                const y0 = y(acc), y1 = y(acc + v);
                acc += v;
                return { ...s, v, y: y1, h: Math.max(0, y0 - y1) };
              }).filter((s) => s.v > 0);
              return (
                <g key={d.day}>
                  {segs.map((s, si) => {
                    const top = si === segs.length - 1;
                    // 2px surface gap between stacked segments; rounded data-end only on the top segment
                    const hgt = Math.max(0, s.h - (si > 0 ? 2 : 0));
                    return top ? (
                      <path key={s.key} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.45}
                        d={`M${x},${s.y + hgt} V${s.y + Math.min(3, hgt / 2)} q0,-${Math.min(3, hgt / 2)} ${Math.min(3, barW / 2)},-${Math.min(3, hgt / 2)} H${x + barW - Math.min(3, barW / 2)} q${Math.min(3, barW / 2)},0 ${Math.min(3, barW / 2)},${Math.min(3, hgt / 2)} V${s.y + hgt} Z`} />
                    ) : (
                      <rect key={s.key} x={x} y={s.y} width={barW} height={hgt} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.45} />
                    );
                  })}
                  {i % labelEvery === 0 && (
                    <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="fill-ink-3 text-[10px]">{fmt(d.day)}</text>
                  )}
                  <rect x={PL + i * slot} y={PT} width={slot} height={H - PT - PB} fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              );
            })}
          </svg>
          {h && hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
              style={{ left: `${((PL + hover * slot + slot / 2) / W) * 100}%`, transform: hover > series.length / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)' }}
            >
              <div className="mb-1 font-medium text-ink">{fmt(h.day)}</div>
              {SERIES.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-ink-2">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                  <span className="flex-1">{s.label}</span>
                  <span className="tabular-nums text-ink">{h[s.key]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
