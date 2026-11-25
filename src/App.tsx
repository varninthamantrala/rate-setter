import { useCallback, useEffect, useMemo, useState } from 'react';
import { CHAPTERS, advance, chapterOf, commit, newGame, type GameState } from './engine/campaign';
import { randomSeed } from './engine/rng';
import type { Policy } from './engine/economy';
import { Masthead } from './components/Masthead';
import { Numbers } from './components/Numbers';
import { Charts, buildSeries } from './components/Charts';
import { Desk } from './components/Desk';
import { Board } from './components/Board';
import { Press } from './components/Press';
import { Debrief } from './components/Debrief';
import { ChapterCard } from './components/ChapterCard';
import { Final } from './components/Final';
import { getDaily } from './lib/api';

const draftFrom = (s: GameState): Policy => ({ ...s.prev, guidance: 0, fxInt: 0, qe: s.prev.qe, macropru: s.prev.macropru });

export default function App() {
  const [seed, setSeed] = useState(randomSeed);
  const [state, setState] = useState<GameState>(() => newGame(seed));
  const [draft, setDraft] = useState<Policy>(() => draftFrom(state));
  const [pressOpen, setPressOpen] = useState(false);
  const [seenChapter, setSeenChapter] = useState(0);
  const start = useMemo(() => newGame(seed).flash, [seed]);

  const reset = useCallback((s: string) => {
    const g = newGame(s);
    setSeed(s);
    setState(g);
    setDraft(draftFrom(g));
    setPressOpen(false);
    setSeenChapter(0);
  }, []);

  const convene = useCallback(() => {
    if (state.phase !== 'briefing') return;
    setState(commit(state, draft));
    setPressOpen(true);
  }, [state, draft]);

  const next = useCallback(() => {
    const n = advance(state);
    setState(n);
    if (n.phase === 'briefing') setDraft(draftFrom(n));
  }, [state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state.phase !== 'briefing' || pressOpen || seenChapter < chapterOf(state.quarter).n) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
      if (e.key === 'ArrowRight') setDraft((d) => ({ ...d, rate: Math.min(12, d.rate + 0.25) }));
      else if (e.key === 'ArrowLeft') setDraft((d) => ({ ...d, rate: Math.max(0, d.rate - 0.25) }));
      else if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'BUTTON') convene();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.phase, state.quarter, pressOpen, seenChapter, convene]);

  const log = state.history[state.history.length - 1];
  const chapter = chapterOf(state.quarter);
  const showChapter = state.phase === 'briefing' && state.quarter === chapter.from && seenChapter < chapter.n;
  const data = buildSeries(start, state.history, state.phase === 'over');
  const lead = log && state.phase === 'briefing' ? log : null;

  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-10 pt-4 sm:px-6">
      <Masthead state={state} onRestart={() => reset(state.seed)} onNew={() => reset(randomSeed())} onDaily={() => getDaily().then((d) => reset(d.seed)).catch(() => alert('Daily seed needs the API server (npm run server).'))} />

      {state.phase === 'over' && <Final state={state} start={start} onNew={() => reset(randomSeed())} onReplay={() => reset(state.seed)} />}

      {state.phase === 'debrief' && log && !pressOpen && <div className="mt-4"><Debrief state={state} log={log} onNext={next} /></div>}

      {state.phase === 'briefing' && (
        <main className="mt-4 grid gap-6 lg:grid-cols-[1.55fr_1fr]">
          <div className="min-w-0 space-y-6">
            <section aria-label="Lead story" className="dbl-bot pb-4">
              <div className="caps text-red">{lead ? `Last quarter: ${lead.event || 'No shock'}` : `${chapter.kicker} · Quarter ${state.quarter}`}</div>
              <h2 className="headline mt-1 text-3xl sm:text-4xl">{lead ? lead.headline : CHAPTERS[0].title.toUpperCase() + ': NEW GOVERNOR TAKES THE CHAIR'}</h2>
              <p className="mt-2 text-lg italic">{lead ? lead.deck : CHAPTERS[0].blurb}</p>
            </section>
            <Numbers state={state} />
            <Charts data={data} />
          </div>
          <div className="col-rule min-w-0 space-y-6 lg:pl-6">
            <Desk state={state} draft={draft} setDraft={setDraft} onConvene={convene} />
            <Board state={state} draft={draft} setDraft={setDraft} />
          </div>
        </main>
      )}

      {pressOpen && log && state.phase === 'debrief' && <Press log={log} onDone={() => setPressOpen(false)} />}
      {showChapter && <ChapterCard chapter={chapter} onBegin={() => setSeenChapter(chapter.n)} />}
    </div>
  );
}
