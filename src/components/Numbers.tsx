import { NAT_U, TARGET_INFL } from '../engine/economy';
import { ELECTION_QUARTERS, START_RESERVES, type GameState } from '../engine/campaign';
import { cx, f1, f2 } from '../lib/format';

function Meter({ v, max = 100, danger }: { v: number; max?: number; danger?: boolean }) {
  return (
    <div className="h-2.5 w-24 border border-ink">
      <div className={cx('h-full', danger ? 'bg-red' : 'bg-ink')} style={{ width: `${Math.min(100, Math.max(0, (v / max) * 100))}%` }} />
    </div>
  );
}

export function Numbers({ state }: { state: GameState }) {
  const f = state.flash;
  const m = state.world.macro;
  const rows: { k: string; v: string; note: string; warn?: boolean }[] = [
    { k: 'Consumer prices, 12 months', v: `${f1(f.piYoY)}%`, note: `target ${TARGET_INFL}.0%`, warn: Math.abs(f.piYoY - TARGET_INFL) > 1.5 },
    { k: 'Prices, latest quarter (annualised)', v: `${f1(f.piQ)}%`, note: 'flash estimate' },
    { k: 'Unemployment', v: `${f1(f.u)}%`, note: `natural rate about ${NAT_U}%`, warn: Math.abs(f.u - NAT_U) > 1.5 },
    { k: 'Output gap (staff estimate)', v: `${f.y > 0 ? '+' : ''}${f1(f.y)}%`, note: 'heavily revised' },
    { k: 'Inflation expectations (survey)', v: `${f1(m.expAvg)}%`, note: 'households and firms', warn: m.expAvg > 3.2 },
    { k: 'House prices', v: f1(f.H), note: 'index, 100 = neutral', warn: f.H > 112 || f.H < 88 },
    { k: 'Currency', v: f1(f.fx), note: 'index, 100 = neutral', warn: f.fx < 88 },
  ];
  const election = ELECTION_QUARTERS.includes(state.quarter);
  return (
    <section aria-label="The numbers">
      <div className="flex items-baseline justify-between border-b-2 border-ink pb-1">
        <h2 className="caps !text-[13px]">The Numbers · Quarter {state.quarter}</h2>
        <span className="caps text-soft">Flash data, subject to revision</span>
      </div>
      <table className="w-full text-left text-[15px]">
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className="border-b border-ink/30">
              <td className="py-1.5 pr-2">{r.k}</td>
              <td className={cx('num py-1.5 pr-3 text-right text-lg font-semibold', r.warn && 'text-red')}>{r.v}</td>
              <td className="hidden py-1.5 text-xs italic text-soft sm:table-cell">{r.note}</td>
            </tr>
          ))}
          <tr className="border-b border-ink/30">
            <td className="py-1.5 pr-2">Financial stress barometer</td>
            <td className={cx('num py-1.5 pr-3 text-right text-lg font-semibold', f.fsi > 55 && 'text-red')}>{Math.round(f.fsi)}</td>
            <td className="hidden py-1.5 sm:table-cell"><Meter v={f.fsi} danger={f.fsi > 55} /></td>
          </tr>
          <tr className="border-b border-ink/30">
            <td className="py-1.5 pr-2">Credibility of the Bank</td>
            <td className={cx('num py-1.5 pr-3 text-right text-lg font-semibold', m.cred < 40 && 'text-red')}>{Math.round(m.cred)}</td>
            <td className="hidden py-1.5 sm:table-cell"><Meter v={m.cred} danger={m.cred < 40} /></td>
          </tr>
          <tr className="border-b border-ink/30">
            <td className="py-1.5 pr-2">Board confidence in you</td>
            <td className={cx('num py-1.5 pr-3 text-right text-lg font-semibold', state.boardConf < 35 && 'text-red')}>{Math.round(state.boardConf)}</td>
            <td className="hidden py-1.5 sm:table-cell"><Meter v={state.boardConf} danger={state.boardConf < 35} /></td>
          </tr>
          {state.quarter >= 17 && (
            <tr className="border-b border-ink/30">
              <td className="py-1.5 pr-2">Foreign reserves</td>
              <td className="num py-1.5 pr-3 text-right text-lg font-semibold">{Math.round(state.reserves)}</td>
              <td className="hidden py-1.5 sm:table-cell"><Meter v={state.reserves} max={START_RESERVES} danger={state.reserves < 25} /></td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-2 text-xs italic text-soft">Policy rate in force: <span className="num not-italic">{f2(state.world.macro.r)}%</span>.{election && ' An election is due this quarter; the Minister is watching.'}</p>
    </section>
  );
}
