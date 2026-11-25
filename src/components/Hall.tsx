import { useCallback, useEffect, useState } from 'react';
import { LogOut, Trophy } from 'lucide-react';
import type { GameState } from '../engine/campaign';
import { cx } from '../lib/format';
import { getBoard, session, signIn, submitRun, type Row, type Submitted } from '../lib/api';

/** The Hall of Record: global leaderboard plus replay-verified score submission. */
export function Hall({ state }: { state: GameState }) {
  const [scope, setScope] = useState<'all' | 'daily'>('all');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [user, setUser] = useState<string | null>(session.user);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Submitted | null>(null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(() => {
    getBoard(scope).then((b) => { setRows(b.rows); setOffline(false); }).catch(() => { setRows([]); setOffline(true); });
  }, [scope]);
  useEffect(refresh, [refresh]);

  const submit = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await submitRun(state.seed, state.history.map((l) => l.decision));
      setResult(r);
      refresh();
    } catch (e) {
      setMsg((e as Error).message);
      if (!session.user()) setUser(null);
    } finally { setBusy(false); }
  };

  const auth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try { setUser(await signIn(mode, name.trim(), pw)); setPw(''); }
    catch (err) { setMsg((err as Error).message); }
    finally { setBusy(false); }
  };

  const completed = state.outcome?.kind === 'completed';
  return (
    <section aria-label="Hall of record" className="mt-8">
      <h3 className="caps flex items-center gap-2 border-b-2 border-ink pb-1 !text-[13px]"><Trophy size={14} /> Hall of Record</h3>
      <div className="mt-3 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex gap-1.5">
            {(['all', 'daily'] as const).map((s) => (
              <button key={s} className={cx('btn !px-3 !py-1', scope === s && 'btn-solid')} onClick={() => setScope(s)}>{s === 'all' ? 'All time' : "Today's seed"}</button>
            ))}
          </div>
          {offline && <p className="text-sm italic text-red">Leaderboard offline. Start the API with <code>npm run server</code>.</p>}
          {rows && !offline && rows.length === 0 && <p className="text-sm italic text-soft">No completed terms yet. Be the first.</p>}
          <ol className="text-[15px]">
            {rows?.map((r, i) => (
              <li key={r.username} className={cx('flex items-baseline gap-3 border-b border-ink/30 py-1.5', r.username === user && 'font-bold')}>
                <span className="num w-6 text-soft">{i + 1}</span>
                <span className="flex-1 truncate">{r.username}</span>
                <span className="caps text-soft">{r.seed}</span>
                <span className="num w-10 text-right">{r.score.toFixed(1)}</span>
                <span className="font-display w-5 text-center text-red">{r.grade}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="border border-ink p-4">
          {result ? (
            <div>
              <div className="caps text-red">Verified by the Bank's auditors</div>
              <p className="mt-1 text-lg">{result.completed
                ? <>Your term scores <b className="num">{result.score.toFixed(1)}</b>{result.rank ? <> and ranks <b>#{result.rank}</b>{result.daily ? " on today's seed" : ' all time'}</> : null}.</>
                : <>Recorded, but early exits don't place on the board.</>}</p>
              <p className="mt-1 text-xs italic text-soft">The server replayed your decisions from the seed; scores are never taken from the browser.</p>
            </div>
          ) : !completed ? (
            <p className="italic">Only full three-term careers place on the board. Finish all 24 quarters to submit.</p>
          ) : user ? (
            <div>
              <div className="flex items-center justify-between">
                <span className="caps">Signed in as {user}</span>
                <button className="btn !px-2 !py-1" onClick={() => { session.clear(); setUser(null); }} aria-label="Sign out" title="Sign out"><LogOut size={14} /></button>
              </div>
              <p className="mt-2 text-sm">Submit seed <b className="num">{state.seed}</b>. The server re-plays your {state.history.length} decisions to verify the score.</p>
              <button className="btn btn-solid mt-3" disabled={busy} onClick={submit}>{busy ? 'Auditing…' : 'Submit to the Hall'}</button>
            </div>
          ) : (
            <form onSubmit={auth} className="space-y-2">
              <div className="caps">{mode === 'login' ? 'Sign in to submit' : 'Create an account to submit'}</div>
              <input className="w-full border border-ink bg-transparent px-2 py-1.5" placeholder="Username" autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="w-full border border-ink bg-transparent px-2 py-1.5" placeholder="Password (8+ characters)" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} />
              <div className="flex items-center gap-3">
                <button className="btn btn-solid" disabled={busy || !name || !pw}>{mode === 'login' ? 'Sign in' : 'Register'}</button>
                <button type="button" className="text-sm underline" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'New here? Register' : 'Have an account? Sign in'}</button>
              </div>
            </form>
          )}
          {msg && <p role="alert" className="mt-2 text-sm text-red">{msg}</p>}
        </div>
      </div>
    </section>
  );
}
