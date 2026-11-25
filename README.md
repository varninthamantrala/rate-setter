# rate-setter
Interactive interest rate and monetary economics simulation
# Rate Setter — The Verra Ledger

You are the Governor of the Reserve Bank of Verra for 24 quarters (three 8-quarter terms). Set the policy rate, forward guidance and, as terms unlock, lending standards, asset purchases and FX defence. Presented as a newspaper front page. All data are fictional and simulated.

## Run
    npm install
    npm run dev:all    # API (port 3001) + game (Vite, proxies /api)
    npm run dev        # game only (leaderboard shows offline)
    npm run server     # API only
    npm test           # 14 engine + 7 server tests

Requires Node 22.5+ (the API uses the built-in `node:sqlite`). Set `JWT_SECRET` and optionally `DB_FILE`, `PORT`; `JWT_SECRET` is required when `NODE_ENV=production`.
    npx tsx scripts/calibrate.ts   # bot-player calibration

## Model
`src/engine/economy.ts`: 10,000 households and 1,000 firms (typed arrays), deterministic seeded RNG. Channels: variable-rate debt repricing, intertemporal substitution, investment via long rate, FX pass-through, Calvo pricing, wage indexation + Phillips term, expectations anchoring, housing, financial stress, QE, macroprudential, reserves.
Each quarter's debrief attributes outcomes via counterfactual re-runs (expectations, energy, slack, FX, your move).

`src/engine/campaign.ts`: flash vs revised data, credibility, board confidence, elections (q7/15/23), chapter-gated tools, early exits.

## Scoring
Average quarterly score across all three terms. S 80+, A 70+, B 60+, C 48+. Any early exit is an F.
Difficulty was tuned with bot players, not human playtests.

## Backend: verified leaderboard
Express + TypeScript + SQLite (`server/`). Accounts use bcrypt-hashed passwords and 7-day JWTs.

The engine is a pure function of (seed, decisions), so the server never trusts a score. `POST /api/runs` takes only the seed and the list of per-quarter decisions, replays the whole game through the same engine module the browser uses, and computes the grade and score itself. It rejects unfinished runs, extra decisions after the game ends, malformed input and duplicate seeds per user. Early exits are recorded but never placed on the board.

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/register`, `/login` | create account / get token |
| `GET /api/daily` | today's shared seed (UTC day) |
| `POST /api/runs` (auth) | submit a finished run for replay verification |
| `GET /api/leaderboard?scope=all\|daily` | best completed run per player |
| `GET /api/runs/mine` (auth) | your history |

Limits: replay verification stops forged scores, but a player can still compute optimal decisions offline with their own bot; the board proves a run was legal, not that a human played it. Auth endpoints have a simple in-memory per-IP rate limit.
<<<<<<< HEAD
Your local README content
=======
GitHub README content
>>>>>>> origin/main