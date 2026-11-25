import { Lock } from 'lucide-react';
import { FX_COST, chapterOf, type GameState } from '../engine/campaign';
import { RATE_MAX, RATE_MIN, type Policy } from '../engine/economy';
import { cx, f2, signed } from '../lib/format';
import { Dial } from './Dial';

function Seg<T extends number>({ value, options, onChange, disabled }: { value: T; options: [T, string][]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button key={v} type="button" className="seg" aria-pressed={value === v} disabled={disabled} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

function Tool({ title, locked, unlock, children, note }: { title: string; locked: boolean; unlock: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="border-t border-ink/50 pt-2">
      <div className="flex items-center justify-between">
        <div className={cx('caps', locked && 'text-soft line-through')}>{title}</div>
        {locked && <span className="caps flex items-center gap-1 text-[10px] text-soft"><Lock size={11} /> {unlock}</span>}
      </div>
      {!locked && <div className="mt-1.5">{children}</div>}
      {!locked && note && <p className="mt-1 text-xs italic text-soft">{note}</p>}
    </div>
  );
}

export function Desk({ state, draft, setDraft, onConvene }: { state: GameState; draft: Policy; setDraft: (p: Policy) => void; onConvene: () => void }) {
  const ch = chapterOf(state.quarter).n;
  const prev = state.prev.rate;
  const step = (d: number) => setDraft({ ...draft, rate: Math.min(RATE_MAX, Math.max(RATE_MIN, Math.round((draft.rate + d) * 4) / 4)) });
  const diff = draft.rate - prev;
  const cost = FX_COST[draft.fxInt];
  return (
    <section aria-label="The Governor's desk" className="space-y-3">
      <div className="flex items-baseline justify-between border-b-2 border-ink pb-1">
        <h2 className="caps !text-[13px]">The Governor's Desk</h2>
        <span className="caps text-soft">Quarter {state.quarter}</span>
      </div>
      <Dial value={draft.rate} prev={prev} />
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {[-1, -0.25, 0.25, 1].map((d) => (
          <button key={d} className="btn !px-2.5 !py-1" onClick={() => step(d)} aria-label={`${d > 0 ? 'Raise' : 'Cut'} the rate by ${Math.abs(d)} points`}>{d > 0 ? '+' : '-'}{Math.abs(d).toFixed(2)}</button>
        ))}
      </div>
      <input type="range" min={RATE_MIN} max={RATE_MAX} step={0.25} value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: Number(e.target.value) })} className="w-full accent-[#8c1d18]" aria-label="Policy rate" />
      <p className="text-center text-sm italic">
        {Math.abs(diff) < 0.01 ? `Hold at ${f2(prev)}%` : `${diff > 0 ? 'Raise' : 'Cut'} ${f2(Math.abs(diff))} points, from ${f2(prev)}% to ${f2(draft.rate)}%`}
        <span className="num not-italic text-soft"> ({signed(diff, 2)})</span>
      </p>

      <div className="border-t border-ink/50 pt-2">
        <div className="caps mb-1.5">Forward guidance</div>
        <Seg value={draft.guidance} onChange={(v) => setDraft({ ...draft, guidance: v })} options={[[-1, 'Signal cuts'], [0, 'Open mind'], [1, 'Signal hikes']]} />
        <p className="mt-1 text-xs italic text-soft">Says where rates go next. Markets believe it only if you have credibility, and you lose it if you do the opposite next quarter.</p>
      </div>

      <Tool title="Lending standards" locked={ch < 2} unlock="Opens in Term II" note="Tighter standards cool speculative booms and cut household debt risk, at some cost to growth.">
        <Seg value={draft.macropru} onChange={(v) => setDraft({ ...draft, macropru: v })} options={[[0, 'Loose'], [1, 'Normal'], [2, 'Tight']]} />
      </Tool>
      <Tool title="Asset purchases" locked={ch < 2} unlock="Opens in Term II" note="Lowers long-term rates and lifts house prices. Printing money while inflation is above 4% costs credibility.">
        <Seg value={draft.qe} onChange={(v) => setDraft({ ...draft, qe: v })} options={[[0, 'None'], [1, 'Small'], [2, 'Large'], [3, 'Heavy']]} />
      </Tool>
      <Tool title="Defend the currency" locked={ch < 3} unlock="Opens in Term III" note={`Sell reserves to prop up the exchange rate. Small costs 12, large costs 25. Reserves left: ${Math.round(state.reserves)}.`}>
        <Seg value={draft.fxInt} onChange={(v) => setDraft({ ...draft, fxInt: v })} options={[[0, 'None'], [1, 'Small'], [2, 'Large']]} />
        {cost > state.reserves && <p className="mt-1 text-xs font-bold text-red">Not enough reserves for this; it will not happen.</p>}
      </Tool>

      <button className="btn btn-solid w-full !py-3 text-base" onClick={onConvene}>Convene the committee</button>
      <p className="text-center text-xs text-soft">Keys: ← → adjust by a quarter point · Enter to convene</p>
    </section>
  );
}
