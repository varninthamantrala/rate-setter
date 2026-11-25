import type { Policy } from '../engine/economy';

const TOKEN_KEY = 'verra-token';
const USER_KEY = 'verra-user';

export interface Row { username: string; score: number; grade: string; seed: string }
export interface Submitted { score: number; grade: string; rank: number | null; daily: boolean; completed: boolean }

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } },
};

export const session = {
  user: () => (store.get(TOKEN_KEY) ? store.get(USER_KEY) : null),
  clear: () => { store.set(TOKEN_KEY, null); store.set(USER_KEY, null); },
};

async function call<T>(path: string, body?: unknown, auth = false): Promise<T> {
  const token = store.get(TOKEN_KEY);
  let r: Response;
  try {
    r = await fetch('/api' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', ...(auth && token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('The press office is offline (is the API server running?)');
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && auth) session.clear();
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}

export async function signIn(mode: 'login' | 'register', username: string, password: string) {
  const j = await call<{ token: string; user: { username: string } }>(`/auth/${mode}`, { username, password });
  store.set(TOKEN_KEY, j.token);
  store.set(USER_KEY, j.user.username);
  return j.user.username;
}
export const getDaily = () => call<{ date: string; seed: string }>('/daily');
export const getBoard = (scope: 'all' | 'daily') => call<{ rows: Row[]; date: string | null }>(`/leaderboard?scope=${scope}&limit=10`);
export const submitRun = (seed: string, decisions: Policy[]) => call<Submitted>('/runs', { seed, decisions }, true);
