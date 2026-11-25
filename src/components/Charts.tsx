import { useState } from 'react';
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Area } from 'recharts';
import { NAT_U, TARGET_INFL } from '../engine/economy';
import type { Flash, QuarterLog } from '../engine/campaign';
import { cx } from '../lib/format';

const INK = '#1a1712';
const RED = '#8c1d18';
const GREY = '#7a705c';
const GRID = '#cdbf9a';
const TIP = { background: '#ece2c6', border: '1px solid #1a1712', borderRadius: 0, fontFamily: '"Old Standard TT", Georgia, serif', fontSize: 13 } as const;
const AXIS = { stroke: INK, fontSize: 12 } as const;

interface Pt {
  q: number;
  piFlash: number;
  piRev?: number;
  rate: number;
  uFlash: number;
  uRev?: number;
  gapEst: number;
  fsi: number;
  H: number;
  fx: number;
}

export function buildSeries(start: Flash, history: QuarterLog[], revealAll: boolean): Pt[] {
  const pts: Pt[] = [{ q: 0, piFlash: start.piYoY, rate: start.r, uFlash: start.u, gapEst: start.y, fsi: start.fsi, H: start.H, fx: start.fx }];
  history.forEach((l, i) => {
    const hidden = !revealAll && i === history.length - 1; // the latest quarter's true value is not known yet
    pts.push({
      q: l.q, piFlash: l.flash.piYoY, piRev: hidden ? undefined : l.truth.piYoY, rate: l.decision.rate,
      uFlash: l.flash.u, uRev: hidden ? undefined : l.truth.u, gapEst: l.flash.y, fsi: l.flash.fsi, H: l.flash.H, fx: l.flash.fx,
    });
  });
  return pts;
}

const TABS = [
  { id: 'prices', label: 'Prices and the rate' },
  { id: 'jobs', label: 'Jobs and output' },
  { id: 'stress', label: 'Stability' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function Charts({ data, height = 250 }: { data: Pt[]; height?: number }) {
  const [tab, setTab] = useState<Tab>('prices');
  const legend = { wrapperStyle: { fontSize: 12, fontFamily: '"Old Standard TT", serif' } };
  const common = { data, margin: { top: 8, right: 8, left: -8, bottom: 0 } };
  const x = <XAxis dataKey="q" tickFormatter={(q) => (q === 0 ? 'Start' : `Q${q}`)} {...AXIS} />;
  return (
    <section aria-label="Charts">
      <div role="tablist" className="mb-2 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} aria-pressed={tab === t.id} className="seg" onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className={cx('border-2 border-ink bg-paper/60 p-2')}>
        <ResponsiveContainer width="100%" height={height}>
          {tab === 'prices' ? (
            <ComposedChart {...common}>
              <CartesianGrid stroke={GRID} strokeDasharray="2 3" />
              {x}
              <YAxis {...AXIS} width={46} allowDecimals={false} tickFormatter={(v) => `${Math.round(v)}%`} domain={[(m: number) => Math.min(0, Math.floor(m)), (m: number) => Math.max(6, Math.ceil(m + 0.5))]} />
              <Tooltip contentStyle={TIP} formatter={(v: number, n: string) => [`${v.toFixed(2)}%`, n]} labelFormatter={(q) => (q === 0 ? 'Start' : `Quarter ${q}`)} />
              <Legend {...legend} />
              <ReferenceLine y={TARGET_INFL} stroke={INK} strokeDasharray="6 3" label={{ value: 'Target 2%', fontSize: 11, fill: INK, position: 'insideTopLeft' }} />
              <Line dataKey="piFlash" name="Inflation as first reported" stroke={INK} strokeWidth={2.2} dot={{ r: 3, fill: INK }} />
              <Line dataKey="piRev" name="Inflation as revised" stroke={GREY} strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls />
              <Line dataKey="rate" name="Policy rate" stroke={RED} strokeWidth={2.4} dot={false} type="stepAfter" />
            </ComposedChart>
          ) : tab === 'jobs' ? (
            <ComposedChart {...common}>
              <CartesianGrid stroke={GRID} strokeDasharray="2 3" />
              {x}
              <YAxis {...AXIS} width={46} allowDecimals={false} tickFormatter={(v) => `${Math.round(v)}%`} domain={[-4, (m: number) => Math.max(10, Math.ceil(m + 0.5))]} />
              <Tooltip contentStyle={TIP} formatter={(v: number, n: string) => [`${v.toFixed(2)}%`, n]} labelFormatter={(q) => (q === 0 ? 'Start' : `Quarter ${q}`)} />
              <Legend {...legend} />
              <ReferenceLine y={NAT_U} stroke={INK} strokeDasharray="6 3" label={{ value: 'Natural rate', fontSize: 11, fill: INK, position: 'insideTopLeft' }} />
              <ReferenceLine y={0} stroke={GREY} />
              <Line dataKey="uFlash" name="Unemployment as first reported" stroke={INK} strokeWidth={2.2} dot={{ r: 3, fill: INK }} />
              <Line dataKey="uRev" name="Unemployment as revised" stroke={GREY} strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls />
              <Line dataKey="gapEst" name="Output gap (staff estimate)" stroke={RED} strokeWidth={1.8} dot={false} />
            </ComposedChart>
          ) : (
            <ComposedChart {...common}>
              <defs>
                <pattern id="dots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill={INK} /></pattern>
              </defs>
              <CartesianGrid stroke={GRID} strokeDasharray="2 3" />
              {x}
              <YAxis yAxisId="l" {...AXIS} width={36} domain={[0, 100]} />
              <YAxis yAxisId="r" orientation="right" {...AXIS} width={40} domain={[40, 160]} />
              <Tooltip contentStyle={TIP} labelFormatter={(q) => (q === 0 ? 'Start' : `Quarter ${q}`)} formatter={(v: number, n: string) => [v.toFixed(1), n]} />
              <Legend {...legend} />
              <ReferenceLine yAxisId="r" y={100} stroke={GREY} strokeDasharray="3 3" />
              <Area yAxisId="l" dataKey="fsi" name="Stress barometer (left)" stroke={INK} fill="url(#dots)" strokeWidth={2} />
              <Line yAxisId="r" dataKey="H" name="House prices (right)" stroke={RED} strokeWidth={2} dot={false} />
              <Line yAxisId="r" dataKey="fx" name="Currency (right)" stroke={GREY} strokeWidth={2} strokeDasharray="5 3" dot={false} />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    </section>
  );
}
