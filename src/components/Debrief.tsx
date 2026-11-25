import { ArrowRight } from 'lucide-react';
import type { GameState, QuarterLog } from '../engine/campaign';
import { cx, f1, f2, signed } from '../lib/format';

function Bar({ label, v, max }: { label: string; v: number; max: number }) {
  const w = Math.min(50, (Math.abs(v) / max) * 50);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_3.5rem] items-center gap-2 border-b border-ink/25 py-1.5 text-[15px]">
      <span>{label}</span>
      <div className="relative h-4 border border-ink">
        <div className="absolute inset-y-0 left-1/2 w-px bg-ink" />
        <div className={cx('absolute inset-y-0', v >= 0 ? 'left-1/2 bg-red' : 'right-1/2 halftone bg-paper2')} style={{ width: `${w}%`, borderLeft: v < 0 ? '1px solid #1a1712' : undefined }} />
      </div>
      <span className="num text-right font-semibold">{signed(v, 1)}</span>
    </div>
  );
}

export function Debrief({ state, log, onNext }: { state: GameState; log: QuarterLog; onNext: () => void }) {
  const a = log.attribution;
  const sum = a.expectations + a.energy + a.slack + a.fx;
  const rest = log.flash.piQ - 2 - sum;
  const rows: [string, number][] = [
    ['Expectations of future inflation', a.expectations],
    ['Fuel and energy costs', a.energy],
    ['Demand and jobs (slack)', a.slack],
    ['The exchange rate', a.fx],
    ['Everything else (price stickiness, noise)', rest],
  ];
  const max = Math.max(1, ...rows.map(([, v]) => Math.abs(v)));
  const top = [...rows.slice(0, 4)].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0];
  const last = state.outcome !== null;
  const mv = log.decision.rate - log.prevRate;
  return (
    <div className="animate-rise">
      <div className="dbl-bot pb-3">
        <div className="caps text-red">Quarter {log.q} · {log.event || 'A quiet quarter'}</div>
        <h2 className="headline mt-1 text-4xl sm:text-5xl">{log.headline}</h2>
        <p className="mt-2 max-w-3xl text-lg italic">{log.deck}</p>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-5">
          <section aria-label="Why did prices move">
            <h3 className="caps border-b-2 border-ink pb-1 !text-[13px]">Why did prices move?</h3>
            <p className="mt-1 text-sm italic text-soft">Staff re-ran the quarter with each force removed. Bars show points of annualised inflation above the 2% target (red pushes prices up, hatched pulls them down).</p>
            {rows.map(([l, v]) => <Bar key={l} label={l} v={v} max={max} />)}
            <p className="mt-2 text-[15px]">
              {Math.abs(top[1]) < 0.3 ? 'No single force dominated this quarter.' : `The biggest force was ${top[0].toLowerCase()}, adding ${signed(top[1], 1)} points.`}
            </p>
          </section>

          <section aria-label="Your move">
            <h3 className="caps border-b-2 border-ink pb-1 !text-[13px]">What your decision did</h3>
            <p className="mt-1.5 text-[15px] leading-snug">
              Against simply holding the rate at {f2(log.prevRate)}%, your {Math.abs(mv) < 0.01 ? 'decision to hold (with your guidance and tools)' : mv > 0 ? `rise of ${f2(mv)} points` : `cut of ${f2(-mv)} points`} moved output by <b className="num">{signed(a.yourMove.output, 2)}</b> points and inflation by <b className="num">{signed(a.yourMove.inflation, 2)}</b> points this quarter. Most of the effect of a rate change arrives over the next year.
            </p>
          </section>

          <section aria-label="Reactions" className="grid gap-3 sm:grid-cols-2">
            {log.reactions.map((r, i) => (
              <blockquote key={i} className="border-l-4 border-ink pl-3">
                <p className="text-[15px] italic leading-snug">"{r.text}"</p>
                <footer className="caps mt-1 text-[10px] text-soft">{r.who === 'hawk' ? 'Marguerite Voss' : r.who === 'dove' ? 'Dev Rao' : r.who === 'minister' ? 'Tobias Hale' : 'The press'}</footer>
              </blockquote>
            ))}
          </section>
        </div>

        <aside className="col-rule space-y-4 lg:pl-6" aria-label="Results">
          <h3 className="caps border-b-2 border-ink pb-1 !text-[13px]">Results of the quarter</h3>
          <table className="w-full text-[15px]">
            <tbody>
              {[
                ['Policy rate', `${f2(log.prevRate)}% → ${f2(log.decision.rate)}%`],
                ['Inflation, 12 months (flash)', `${f1(log.flash.piYoY)}%`],
                ['Unemployment (flash)', `${f1(log.flash.u)}%`],
                ['Stress barometer', `${Math.round(log.flash.fsi)}`],
                ['Credibility', `${Math.round(log.truth.cred)} (${signed(log.credDelta, 1)} say-do)`],
                ['Board confidence', `${Math.round(state.boardConf)} (${signed(log.bcDelta, 1)})`],
              ].map(([k, v]) => (
                <tr key={k} className="border-b border-ink/30"><td className="py-1.5 pr-2">{k}</td><td className="num py-1.5 text-right font-semibold">{v}</td></tr>
              ))}
            </tbody>
          </table>
          {log.credNotes.length > 0 && <ul className="space-y-1 text-sm italic text-soft">{log.credNotes.map((n) => <li key={n}>{n}</li>)}</ul>}
          {log.revision && (
            <p className="text-sm italic">Revision: last quarter's inflation was first reported at <b className="num not-italic">{f1(log.revision.flash)}%</b> and is now put at <b className="num not-italic">{f1(log.revision.actual)}%</b>.</p>
          )}
          <div className="border-2 border-ink p-3 text-center">
            <div className="caps text-soft">Quarter score</div>
            <div className="num text-4xl font-semibold">{Math.round(log.score)}</div>
            <div className="text-xs italic text-soft">100 means inflation at target, jobs at the natural rate and a calm financial system.</div>
          </div>
          <button className="btn btn-solid w-full !py-3" onClick={onNext}>{last ? 'See the final edition' : `Turn the page: Quarter ${state.quarter + 1}`} <ArrowRight size={16} /></button>
        </aside>
      </div>
    </div>
  );
}
