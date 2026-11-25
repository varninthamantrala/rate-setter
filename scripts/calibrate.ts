// Plays the campaign with simple bots over many seeds to calibrate scoring and difficulty.
import { TOTAL_Q, advance, advisors, commit, newGame, report, type GameState } from '../src/engine/campaign';
import type { Policy } from '../src/engine/economy';

type Bot = (s: GameState) => Policy;
const mk = (rate: number, _s: GameState, g: -1 | 0 | 1 = 0, over: Partial<Policy> = {}): Policy => ({ rate, guidance: g, macropru: 1, qe: 0, fxInt: 0, ...over, ...{} });
const bots: Record<string, Bot> = {
  hold: (s) => mk(3, s),
  alwaysCut: () => ({ rate: 0.5, guidance: -1, macropru: 1, qe: 0, fxInt: 0 }),
  alwaysHike: () => ({ rate: 8, guidance: 1, macropru: 1, qe: 0, fxInt: 0 }),
  technocrat: (s) => mk(advisors(s)[2].rec, s),
  taylorSmart: (s) => {
    const rec = advisors(s)[2].rec;
    const f = s.flash;
    const d = rec - s.prev.rate;
    return { rate: rec, guidance: d > 0.1 ? 1 : d < -0.1 ? -1 : 0, macropru: s.quarter >= 9 && s.quarter <= 15 ? 2 : 1, qe: 0, fxInt: s.quarter >= 17 && f.fx < 90 && s.reserves >= 12 ? 1 : 0 };
  },
  hawk: (s) => mk(advisors(s)[0].rec, s),
  minister: (s) => mk(advisors(s)[3].rec, s),
};
const N = 12;
for (const [name, bot] of Object.entries(bots)) {
  const scores: number[] = [];
  const outs: Record<string, number> = {};
  const grades: Record<string, number> = {};
  const chap = [0, 0, 0], chapN = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    let s = newGame('C' + i);
    while (s.phase !== 'over') {
      if (s.phase === 'briefing') s = commit(s, bot(s));
      else s = advance(s);
    }
    const r = report(s);
    scores.push(r.avgScore);
    r.chapterScores.forEach((c, k) => { if (c.avg !== null) { chap[k] += c.avg; chapN[k]++; } });
    outs[s.outcome!.kind] = (outs[s.outcome!.kind] ?? 0) + 1;
    grades[r.grade] = (grades[r.grade] ?? 0) + 1;
  }
  scores.sort((a, b) => a - b);
  const q = (x: number) => scores[Math.floor(x * (N - 1))].toFixed(0);
  console.log(name.padEnd(12), `score p10 ${q(0.1)} med ${q(0.5)} p90 ${q(0.9)}`, JSON.stringify(outs), JSON.stringify(grades), `ch1-3 avg ${chap.map((c, k) => (chapN[k] ? (c / chapN[k]).toFixed(0) : '-')).join('/')}`);
}
void TOTAL_Q;
