import { advance, commit, newGame, report, TOTAL_Q, type FinalGrade, type Outcome } from '../src/engine/campaign';
import type { Policy } from '../src/engine/economy';

export const SEED_RE = /^[A-Z0-9]{4,12}$/;

export interface Verified {
  grade: FinalGrade;
  score: number;
  quarters: number;
  completed: boolean;
  outcome: Outcome['kind'];
}

export class RunRejected extends Error {}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Shape-check one untrusted decision. The engine clamps and tool-gates it again in sanitize(). */
export function parseDecision(x: unknown): Policy {
  const d = x as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') throw new RunRejected('decision must be an object');
  const { rate, guidance, macropru, qe, fxInt } = d;
  if (!isNum(rate) || !isNum(guidance) || !isNum(macropru) || !isNum(qe) || !isNum(fxInt)) throw new RunRejected('decision fields must be numbers');
  return { rate, guidance: guidance as Policy['guidance'], macropru: macropru as Policy['macropru'], qe: qe as Policy['qe'], fxInt: fxInt as Policy['fxInt'] };
}

/**
 * Re-play a run from nothing but its seed and the player's decisions. The client never
 * sends a score: it is recomputed here by the same pure engine, so it cannot be forged.
 * The run must end exactly when the engine says it ends: no missing or extra decisions.
 */
export function replay(seed: string, decisions: unknown): Verified {
  if (typeof seed !== 'string' || !SEED_RE.test(seed)) throw new RunRejected('bad seed');
  if (!Array.isArray(decisions) || decisions.length === 0 || decisions.length > TOTAL_Q) throw new RunRejected(`need 1 to ${TOTAL_Q} decisions`);
  let s = newGame(seed);
  for (let i = 0; i < decisions.length; i++) {
    if (s.phase !== 'briefing') throw new RunRejected('decisions continue after the game ended');
    s = advance(commit(s, parseDecision(decisions[i])));
  }
  if (s.phase !== 'over') throw new RunRejected('run is not finished');
  const r = report(s);
  return { grade: r.grade, score: Math.round(r.avgScore * 100) / 100, quarters: r.quartersServed, completed: s.outcome?.kind === 'completed', outcome: s.outcome!.kind };
}

/** Everyone gets the same seed each UTC day. */
export function dailySeed(date = new Date()): { date: string; seed: string } {
  const day = date.toISOString().slice(0, 10);
  let h = 2166136261;
  for (const c of 'verra-daily-' + day) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return { date: day, seed: h.toString(36).toUpperCase().padStart(6, '0').slice(0, 6) };
}
