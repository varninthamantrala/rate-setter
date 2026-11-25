import { CalendarDays, RotateCcw, Shuffle } from 'lucide-react';
import { CHAPTERS, TOTAL_Q, chapterOf, type GameState } from '../engine/campaign';
import { cx } from '../lib/format';

const ROMAN = ['I', 'II', 'III'];

export function Masthead({ state, onRestart, onNew, onDaily }: { state: GameState; onRestart: () => void; onNew: () => void; onDaily: () => void }) {
  const ch = chapterOf(state.quarter);
  const done = state.phase === 'briefing' ? state.quarter - 1 : state.quarter;
  return (
    <header className="dbl-bot pb-2 text-center">
      <div className="caps flex items-center justify-between gap-3 text-soft">
        <span className="hidden sm:inline">Late edition · Price two shillings</span>
        <span className="mx-auto sm:mx-0">Reserve Bank of Verra · The Governor's Office</span>
        <span className="hidden sm:inline">Seed {state.seed}</span>
      </div>
      <h1 className="headline my-1 text-5xl sm:text-7xl" style={{ fontFamily: '"Playfair Display", serif', letterSpacing: '0.01em' }}>The Verra Ledger</h1>
      <div className="rule-top flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-2">
        <div className="caps">Quarter {Math.min(state.quarter, TOTAL_Q)} of {TOTAL_Q} · {ch.kicker}: {ch.title}</div>
        <div className="flex items-center gap-1" aria-label={`${done} of ${TOTAL_Q} quarters served`}>
          {CHAPTERS.map((c) => (
            <div key={c.n} className="flex items-center gap-0.5 border-r border-ink/40 pr-1.5 last:border-r-0">
              <span className="caps mr-1 text-[9px] text-soft">{ROMAN[c.n - 1]}</span>
              {Array.from({ length: c.to - c.from + 1 }, (_, i) => {
                const q = c.from + i;
                return <span key={q} className={cx('h-2.5 w-2.5 border border-ink', q <= done ? 'bg-ink' : q === state.quarter && state.phase === 'briefing' ? 'bg-red' : 'bg-transparent')} />;
              })}
            </div>
          ))}
        </div>
        <div className="flex gap-1.5">
          <button className="btn !px-2 !py-1" onClick={onRestart} title="Restart this seed" aria-label="Restart this seed"><RotateCcw size={14} /></button>
          <button className="btn !px-2 !py-1" onClick={onDaily} title="Today's seed (same for everyone)" aria-label="Today's seed"><CalendarDays size={14} /></button>
          <button className="btn !px-2 !py-1" onClick={onNew} title="New seed" aria-label="New seed"><Shuffle size={14} /></button>
        </div>
      </div>
    </header>
  );
}
