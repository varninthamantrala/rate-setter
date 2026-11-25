import { RotateCcw, Shuffle } from 'lucide-react';
import { CHAPTERS, GRADE_CUTS, TOTAL_Q, report, type GameState } from '../engine/campaign';
import { cx, f1 } from '../lib/format';
import { Charts, buildSeries } from './Charts';
import type { Flash } from '../engine/campaign';
import { Hall } from './Hall';

const VERDICT: Record<string, string> = {
  S: 'A masterclass. Historians will cite it.',
  A: 'A steady hand through three crises.',
  B: 'Solid work with some scars.',
  C: 'You survived. Barely, and not without damage.',
  F: 'The country will remember the term differently.',
};

export function Final({ state, start, onNew, onReplay }: { state: GameState; start: Flash; onNew: () => void; onReplay: () => void }) {
  const r = report(state);
  const o = state.outcome!;
  const completed = o.kind === 'completed';
  const head = completed
    ? r.grade === 'F' || r.grade === 'C' ? 'GOVERNOR LEAVES OFFICE AFTER TURBULENT TENURE' : 'GOVERNOR COMPLETES THREE TERMS TO PRAISE'
    : o.kind === 'crisis' ? 'BANKS TOTTER AS GOVERNOR RESIGNS'
    : o.kind === 'unanchored' ? 'MARKETS LOSE FAITH: GOVERNOR REMOVED'
    : o.kind === 'vote' ? 'GOVERNOR DENIED A NEW TERM'
    : 'GOVERNOR DISMISSED BY BOARD';
  return (
    <div className="animate-rise">
      <div className="dbl-bot relative pb-4">
        <div className="caps text-red">Final edition · {r.quartersServed} of {TOTAL_Q} quarters served</div>
        <h2 className="headline mt-1 max-w-3xl pr-0 text-4xl sm:text-5xl lg:pr-52">{head}</h2>
        <p className="mt-2 max-w-2xl text-lg italic">{o.reason} {completed && VERDICT[r.grade]}</p>
        <div className="mt-4 flex justify-center lg:absolute lg:right-2 lg:top-6 lg:mt-0">
          <div className="animate-stamp border-4 border-double border-red px-6 py-2 text-center text-red" style={{ transform: 'rotate(-8deg)' }} aria-label={`Final grade ${r.grade}`}>
            <div className="caps !text-[10px]">Final grade</div>
            <div className="font-display text-7xl font-bold leading-none">{r.grade}</div>
            <div className="num text-sm font-semibold">{Math.round(r.avgScore)} / 100</div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[2fr_3fr]">
        <section aria-label="Term by term">
          <h3 className="caps border-b-2 border-ink pb-1 !text-[13px]">Term by term</h3>
          {CHAPTERS.map((c) => {
            const s = r.chapterScores[c.n - 1].avg;
            return (
              <div key={c.n} className="border-b border-ink/30 py-2">
                <div className="flex items-baseline justify-between"><span className="font-bold">{c.kicker}: {c.title}</span><span className="num font-semibold">{s === null ? 'n/a' : Math.round(s)}</span></div>
                <div className="mt-1 h-2.5 border border-ink"><div className={cx('h-full', s !== null && s < 48 ? 'bg-red' : 'bg-ink')} style={{ width: `${s ?? 0}%` }} /></div>
              </div>
            );
          })}
          <table className="mt-3 w-full text-[15px]"><tbody>
            {[
              ['Average miss on inflation', `${f1(r.avgInflationGap)} points`],
              ['Average miss on unemployment', `${f1(r.avgUnemploymentGap)} points`],
              ['Worst financial stress', `${Math.round(r.peakStress)} of 100`],
              ['Lowest credibility', `${Math.round(r.minCred)} of 100`],
            ].map(([k, v]) => <tr key={k} className="border-b border-ink/30"><td className="py-1.5">{k}</td><td className="num py-1.5 text-right font-semibold">{v}</td></tr>)}
          </tbody></table>
          <p className="mt-2 text-xs italic text-soft">Grades need all three terms: S {GRADE_CUTS.S}+, A {GRADE_CUTS.A}+, B {GRADE_CUTS.B}+, C {GRADE_CUTS.C}+ on average quarterly score. Any early exit is an F.</p>
        </section>
        <Charts data={buildSeries(start, state.history, true)} height={280} />
      </div>

      <Hall state={state} />

      <div className="mt-6 flex flex-wrap gap-3">
        <button className="btn btn-solid" onClick={onNew}><Shuffle size={16} /> New term, new seed</button>
        <button className="btn" onClick={onReplay}><RotateCcw size={16} /> Replay seed {state.seed}</button>
      </div>
    </div>
  );
}
