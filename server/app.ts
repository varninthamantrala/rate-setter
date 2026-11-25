import bcrypt from 'bcryptjs';
import express, { type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import type { DB } from './db';
import { RunRejected, dailySeed, replay } from './verify';

interface Opts { db: DB; jwtSecret: string; now?: () => Date; rateLimit?: number }
type AuthedReq = Request & { uid?: number };

const USER_RE = /^[A-Za-z0-9_]{3,20}$/;

/** Tiny fixed-window limiter (per IP + route group). Enough to blunt brute force without a dependency. */
function limiter(max: number, windowMs = 60_000) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const t = Date.now();
    const h = hits.get(key);
    if (!h || t > h.reset) hits.set(key, { n: 1, reset: t + windowMs });
    else if (++h.n > max) return void res.status(429).json({ error: 'Too many requests, slow down' });
    next();
  };
}

export function createApp({ db, jwtSecret, now = () => new Date(), rateLimit = 20 }: Opts) {
  const app = express();
  app.use(express.json({ limit: '32kb' }));

  const sign = (id: number, username: string) => jwt.sign({ sub: id, username }, jwtSecret, { expiresIn: '7d' });
  const auth = (req: AuthedReq, res: Response, next: NextFunction) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    try {
      if (!m) throw new Error('no token');
      req.uid = Number((jwt.verify(m[1], jwtSecret) as jwt.JwtPayload).sub);
      next();
    } catch {
      res.status(401).json({ error: 'Sign in required' });
    }
  };

  const creds = (req: Request) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || !USER_RE.test(username)) throw new RunRejected('Username: 3-20 letters, numbers or underscores');
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) throw new RunRejected('Password: 8-72 characters');
    return { username, password };
  };

  app.post('/api/auth/register', limiter(rateLimit), (req, res) => {
    const { username, password } = creds(req);
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) return void res.status(409).json({ error: 'That name is taken' });
    const info = db.prepare('INSERT INTO users (username, pw_hash) VALUES (?, ?)').run(username, bcrypt.hashSync(password, 10));
    res.status(201).json({ token: sign(Number(info.lastInsertRowid), username), user: { username } });
  });

  app.post('/api/auth/login', limiter(rateLimit), (req, res) => {
    const { username, password } = creds(req);
    const u = db.prepare('SELECT id, username, pw_hash FROM users WHERE username = ?').get(username) as { id: number; username: string; pw_hash: string } | undefined;
    if (!u || !bcrypt.compareSync(password, u.pw_hash)) return void res.status(401).json({ error: 'Wrong name or password' });
    res.json({ token: sign(u.id, u.username), user: { username: u.username } });
  });

  app.get('/api/daily', (_req, res) => res.json(dailySeed(now())));

  app.post('/api/runs', auth, limiter(rateLimit * 3), (req: AuthedReq, res) => {
    const { seed, decisions } = req.body ?? {};
    const v = replay(seed, decisions); // throws RunRejected on anything that is not a legal, finished run
    const daily = dailySeed(now());
    const dailyDate = seed === daily.seed ? daily.date : null;
    const prior = db.prepare('SELECT id, score FROM runs WHERE user_id = ? AND seed = ?').get(req.uid!, seed) as { id: number; score: number } | undefined;
    if (prior) return void res.status(409).json({ error: 'You already submitted this seed', score: prior.score });
    db.prepare('INSERT INTO runs (user_id, seed, daily_date, score, grade, quarters, completed, outcome, decisions) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(req.uid!, seed, dailyDate, v.score, v.grade, v.quarters, v.completed ? 1 : 0, v.outcome, JSON.stringify(decisions));
    const rank = (db.prepare(
      `SELECT COUNT(*) + 1 AS r FROM (SELECT MAX(score) AS s FROM runs WHERE completed = 1 AND user_id != ? ${dailyDate ? 'AND daily_date = ?' : ''} GROUP BY user_id) WHERE s > ?`,
    ).get(...(dailyDate ? [req.uid!, dailyDate, v.score] : [req.uid!, v.score])) as { r: number }).r;
    res.status(201).json({ ...v, daily: dailyDate !== null, rank: v.completed ? rank : null });
  });

  /** Best completed run per player. Early exits (an F) never place. */
  app.get('/api/leaderboard', (req, res) => {
    const scope = req.query.scope === 'daily' ? 'daily' : 'all';
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const day = dailySeed(now()).date;
    const rows = db.prepare(
      `SELECT u.username, r.score, r.grade, r.seed, r.created_at AS at
       FROM runs r JOIN users u ON u.id = r.user_id
       WHERE r.completed = 1 ${scope === 'daily' ? 'AND r.daily_date = ?' : ''}
         AND r.score = (SELECT MAX(score) FROM runs r2 WHERE r2.user_id = r.user_id AND r2.completed = 1 ${scope === 'daily' ? 'AND r2.daily_date = r.daily_date' : ''})
       GROUP BY u.id ORDER BY r.score DESC, r.id ASC LIMIT ?`,
    ).all(...(scope === 'daily' ? [day, limit] : [limit]));
    res.json({ scope, date: scope === 'daily' ? day : null, rows });
  });

  app.get('/api/runs/mine', auth, (req: AuthedReq, res) => {
    res.json(db.prepare('SELECT seed, score, grade, quarters, outcome, daily_date AS daily, created_at AS at FROM runs WHERE user_id = ? ORDER BY id DESC LIMIT 25').all(req.uid!));
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof RunRejected) return void res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  });
  return app;
}
