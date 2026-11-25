import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { advance, commit, newGame, type GameState } from '../src/engine/campaign';
import type { Policy } from '../src/engine/economy';
import { createApp } from './app';
import { openDb } from './db';
import { dailySeed, replay, RunRejected } from './verify';

/** A simple rule-following player, so we have a legal full run to submit. */
function play(seed: string, rule: (s: GameState) => Policy): { decisions: Policy[]; state: GameState } {
  let s = newGame(seed);
  const decisions: Policy[] = [];
  while (s.phase !== 'over') {
    if (s.phase === 'briefing') {
      const d = rule(s);
      decisions.push(d);
      s = commit(s, d);
    } else s = advance(s);
  }
  return { decisions, state: s };
}
const steady = (s: GameState): Policy => ({ rate: Math.max(0, Math.min(12, 2.5 + 1.5 * (s.flash.piYoY - 2))), guidance: 0, macropru: s.prev.macropru, qe: s.prev.qe, fxInt: 0 });
const frozen = (): Policy => ({ rate: 0, guidance: 0, macropru: 1, qe: 0, fxInt: 0 });

describe('replay verification', () => {
  it('recomputes the same result as live play', () => {
    const { decisions, state } = play('ABC123', steady);
    const v = replay('ABC123', decisions);
    expect(v.quarters).toBe(state.history.length);
    expect(v.outcome).toBe(state.outcome!.kind);
  });
  it('rejects unfinished, over-long and malformed runs', () => {
    const { decisions } = play('ABC123', steady);
    expect(() => replay('ABC123', decisions.slice(0, 3))).toThrow(RunRejected);
    expect(() => replay('ABC123', [...decisions, decisions[0]])).toThrow(RunRejected);
    expect(() => replay('ABC123', [{ rate: 'x' }])).toThrow(RunRejected);
    expect(() => replay('bad seed!', decisions)).toThrow(RunRejected);
  });
  it('daily seed is stable per UTC day and differs across days', () => {
    expect(dailySeed(new Date('2026-01-01T05:00:00Z'))).toEqual(dailySeed(new Date('2026-01-01T23:00:00Z')));
    expect(dailySeed(new Date('2026-01-01T05:00:00Z')).seed).not.toBe(dailySeed(new Date('2026-01-02T05:00:00Z')).seed);
  });
});

describe('API', () => {
  let base = '';
  let close: () => void;
  const now = new Date('2026-03-05T10:00:00Z');
  const daily = dailySeed(now).seed;
  const call = async (path: string, body?: unknown, token?: string) => {
    const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: (await r.json()) as any };
  };
  beforeAll(async () => {
    const server = createApp({ db: openDb(':memory:'), jwtSecret: 'test', now: () => now, rateLimit: 1000 }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  afterAll(() => close());

  it('registers, logs in, and rejects bad credentials', async () => {
    expect((await call('/api/auth/register', { username: 'ada', password: 'longenough' })).status).toBe(201);
    expect((await call('/api/auth/register', { username: 'ADA', password: 'longenough' })).status).toBe(409);
    expect((await call('/api/auth/register', { username: 'x', password: 'longenough' })).status).toBe(400);
    expect((await call('/api/auth/login', { username: 'ada', password: 'wrongwrong' })).status).toBe(401);
    expect((await call('/api/auth/login', { username: 'ada', password: 'longenough' })).status).toBe(200);
  });

  it('requires a token to submit', async () => {
    expect((await call('/api/runs', { seed: daily, decisions: [] })).status).toBe(401);
  });

  it('scores a submitted run server-side, ignores any client score, and blocks resubmits', async () => {
    const { token } = (await call('/api/auth/login', { username: 'ada', password: 'longenough' })).json;
    const { decisions } = play(daily, steady);
    const r = await call('/api/runs', { seed: daily, decisions, score: 100, grade: 'S' }, token);
    expect(r.status).toBe(201);
    expect(r.json.score).toBeLessThan(100);
    expect(r.json.daily).toBe(true);
    expect((await call('/api/runs', { seed: daily, decisions }, token)).status).toBe(409);
    expect((await call('/api/runs', { seed: daily, decisions: decisions.slice(0, 5) }, token)).status).toBe(400);
  });

  it('ranks players and keeps early exits off the board', async () => {
    const bob = (await call('/api/auth/register', { username: 'bob', password: 'longenough' })).json.token;
    const { decisions } = play('QWERT1', frozen);
    const r = await call('/api/runs', { seed: 'QWERT1', decisions }, bob);
    expect(r.status).toBe(201);
    expect(r.json.completed).toBe(false);
    expect(r.json.rank).toBeNull();
    const lb = (await call('/api/leaderboard?scope=all')).json;
    expect(lb.rows.map((x: any) => x.username)).toEqual(['ada']);
    const dl = (await call('/api/leaderboard?scope=daily')).json;
    expect(dl.rows).toHaveLength(1);
    const mine = (await call('/api/runs/mine', undefined, bob)).json;
    expect(mine).toHaveLength(1);
  });
});
