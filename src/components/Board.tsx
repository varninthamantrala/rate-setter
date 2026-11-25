import { advisors, ELECTION_QUARTERS, type GameState } from '../engine/campaign';
import type { Policy } from '../engine/economy';
import { f2 } from '../lib/format';

export function Board({ state, draft, setDraft }: { state: GameState; draft: Policy; setDraft: (p: Policy) => void }) {
  const adv = advisors(state);
  const election = ELECTION_QUARTERS.includes(state.quarter);
  return (
    <section aria-label="Letters from the board" className="space-y-3">
      <div className="flex items-baseline justify-between border-b-2 border-ink pb-1">
        <h2 className="caps !text-[13px]">Letters to the Governor</h2>
        <span className="caps text-soft">{election ? 'Election quarter' : 'Board room'}</span>
      </div>
      {adv.map((a) => (
        <article key={a.id} className="border-b border-ink/30 pb-3 last:border-b-0">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="font-bold">{a.name}</div>
              <div className="caps text-[10px] text-soft">{a.title}</div>
            </div>
            <button className="btn !px-2 !py-1 !text-xs" onClick={() => setDraft({ ...draft, rate: a.rec })} aria-label={`Adopt ${a.name}'s rate of ${f2(a.rec)} percent`}>
              Back {f2(a.rec)}%
            </button>
          </div>
          <p className="mt-1 text-[15px] italic leading-snug">"{a.quote}"</p>
        </article>
      ))}
      <p className="text-xs italic text-soft">Advisers see the same flash figures you do. Each follows a different rule of thumb; none of them knows what the lending boom or the exchange rate will do.</p>
    </section>
  );
}
