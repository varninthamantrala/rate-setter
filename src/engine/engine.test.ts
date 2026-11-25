import { describe, expect, it } from 'vitest';
import { N_HH, N_FIRMS, NEUTRAL_POLICY, NO_SHOCK, attribute, createWorld, step, type Policy } from './economy';
import { TOTAL_Q, advance, advisors, chapterOf, commit, newGame, report, sanitize, type GameState } from './campaign';

const start = { r: 3.5, piYoY: 2, expAvg: 2, cred: 70 };
const run = (policy: Policy, quarters: number, seed = 1) => {
  let w = createWorld(seed, start);
  for (let t = 1; t <= quarters; t++) w = step(w, policy, NO_SHOCK, 100 + t).world;
  return w.macro;
};
const play = (seed: string, bot: (s: GameState) => Policy): GameState => {
  let s = newGame(seed);
  while (s.phase !== 'over') s = s.phase === 'briefing' ? commit(s, bot(s)) : advance(s);
  return s;
};
const follow = (s: GameState): Policy => ({ ...s.prev, rate: advisors(s)[2].rec, guidance: 0 });

describe('economy', () => {
  it('has 10,000 households and 1,000 firms', () => {
    const w = createWorld(1, start);
    expect(w.hh.mpc.length).toBe(N_HH);
    expect(w.firms.p.length).toBe(N_FIRMS);
  });

  it('is deterministic for a given seed and differs across seeds', () => {
    expect(run(NEUTRAL_POLICY, 6, 5)).toEqual(run(NEUTRAL_POLICY, 6, 5));
    expect(run(NEUTRAL_POLICY, 6, 5).P).not.toBe(run(NEUTRAL_POLICY, 6, 6).P);
  });

  it('does not mutate its input world', () => {
    const w = createWorld(1, start);
    const before = w.macro.P;
    const e0 = w.hh.exp[0];
    step(w, { ...NEUTRAL_POLICY, rate: 8 }, NO_SHOCK, 1);
    expect(w.macro.P).toBe(before);
    expect(w.hh.exp[0]).toBe(e0);
  });

  it('holds steady at the neutral rate with no shocks', () => {
    const m = run(NEUTRAL_POLICY, 12);
    expect(m.piYoY).toBeGreaterThan(1.6);
    expect(m.piYoY).toBeLessThan(2.4);
    expect(m.u).toBeGreaterThan(4.7);
    expect(m.u).toBeLessThan(5.3);
  });

  it('tighter policy lowers inflation and raises unemployment; looser does the opposite', () => {
    const neutral = run(NEUTRAL_POLICY, 8);
    const tight = run({ ...NEUTRAL_POLICY, rate: 5.5 }, 8);
    const loose = run({ ...NEUTRAL_POLICY, rate: 1.5 }, 8);
    expect(tight.piYoY).toBeLessThan(neutral.piYoY);
    expect(tight.u).toBeGreaterThan(neutral.u);
    expect(loose.piYoY).toBeGreaterThan(neutral.piYoY);
    expect(loose.u).toBeLessThan(neutral.u);
  });

  it('forward guidance moves inflation expectations when the bank is credible', () => {
    const hawk = run({ ...NEUTRAL_POLICY, guidance: 1 }, 4);
    const dove = run({ ...NEUTRAL_POLICY, guidance: -1 }, 4);
    expect(hawk.expAvg).toBeLessThan(dove.expAvg);
  });

  it('an energy shock raises inflation, and the attribution names energy as the driver', () => {
    const w0 = createWorld(1, start);
    const shock = { ...NO_SHOCK, energy: 9 };
    const { world } = step(w0, NEUTRAL_POLICY, shock, 42);
    const a = attribute(w0, NEUTRAL_POLICY, shock, 42, world.macro, {});
    expect(world.macro.piQ).toBeGreaterThan(3);
    expect(a.energy).toBeGreaterThan(1);
    expect(Math.abs(a.expectations + a.energy + a.slack + a.fx + a.residual - a.total)).toBeLessThan(1e-9);
  });

  it('a falling exchange rate passes through to prices', () => {
    const w0 = createWorld(1, start);
    const calm = step(w0, NEUTRAL_POLICY, NO_SHOCK, 7).world.macro;
    const run0 = step(w0, NEUTRAL_POLICY, { ...NO_SHOCK, fx: -9 }, 7).world.macro;
    expect(run0.fx).toBeLessThan(calm.fx);
    expect(run0.piQ).toBeGreaterThan(calm.piQ);
  });
});

describe('campaign', () => {
  it('locks tools until their chapter and spends reserves on defence', () => {
    const s = newGame('LOCK');
    const wish: Policy = { rate: 4, guidance: 0, macropru: 2, qe: 3, fxInt: 2 };
    expect(sanitize(s, wish)).toMatchObject({ macropru: 1, qe: 0, fxInt: 0 });
    expect(sanitize({ ...s, quarter: 10 }, wish)).toMatchObject({ macropru: 2, qe: 3, fxInt: 0 });
    expect(sanitize({ ...s, quarter: 18 }, wish).fxInt).toBe(2);
    expect(sanitize({ ...s, quarter: 18, reserves: 10 }, wish).fxInt).toBe(0);
    expect(chapterOf(8).n).toBe(1);
    expect(chapterOf(9).n).toBe(2);
    expect(chapterOf(24).n).toBe(3);
  });

  it('advisor recommendations are valid quarter-point rates', () => {
    for (const a of advisors(newGame('ADV'))) {
      expect(a.rec).toBeGreaterThanOrEqual(0);
      expect(a.rec).toBeLessThanOrEqual(12);
      expect(Math.abs(a.rec * 4 - Math.round(a.rec * 4))).toBeLessThan(1e-9);
    }
  });

  it('punishes saying one thing and doing another', () => {
    let s = commit(newGame('SAYDO'), { rate: 3, guidance: 1, macropru: 1, qe: 0, fxInt: 0 });
    s = advance(s);
    const cut = commit(s, { rate: 2, guidance: 0, macropru: 1, qe: 0, fxInt: 0 });
    expect(cut.history[1].credDelta).toBeLessThanOrEqual(-5);
    const kept = commit(s, { rate: 3.5, guidance: 0, macropru: 1, qe: 0, fxInt: 0 });
    expect(kept.history[1].credDelta).toBeGreaterThan(0);
  });

  it('is reproducible: the same seed and decisions give identical results', () => {
    const a = play('REPEAT', follow);
    const b = play('REPEAT', follow);
    expect(a.history.map((l) => l.truth.piYoY)).toEqual(b.history.map((l) => l.truth.piYoY));
    expect(a.history.length).toBe(TOTAL_Q);
  });

  it('a sensible rule completes all 24 quarters; freezing the rate gets the governor voted out', () => {
    const good = play('PLAY1', follow);
    expect(good.outcome?.kind).toBe('completed');
    expect(['S', 'A', 'B', 'C']).toContain(report(good).grade);
    const frozen = play('PLAY1', (s) => ({ ...s.prev, rate: 3 }));
    expect(frozen.outcome?.kind).not.toBe('completed');
    expect(report(frozen).grade).toBe('F');
  });

  it('shows noisy flash data and later reveals the revision', () => {
    let s = commit(newGame('FLASH'), { ...NEUTRAL_POLICY, rate: 3 });
    expect(s.history[0].revision).toBeNull();
    s = commit(advance(s), { ...NEUTRAL_POLICY, rate: 3 });
    expect(s.history[1].revision).not.toBeNull();
    expect(s.history[0].flash.piYoY).not.toBe(s.history[0].truth.piYoY);
  });
});
