/**
 * Rate Setter: campaign layer. Scenario shocks, the state machine, advisors,
 * scoring, credibility and board confidence, and the newspaper copy.
 * Pure functions over GameState; all randomness derives from the seed.
 */
import { NAT_U, NEUTRAL_POLICY, NO_SHOCK, RATE_MAX, RATE_MIN, TARGET_INFL, attribute, createWorld, step, type Attribution, type Macro, type Policy, type Shock, type World } from './economy';
import { clamp, gauss, hashSeed, mulberry32 } from './rng';

export const TOTAL_Q = 24;
export const ELECTION_QUARTERS = [7, 15, 23];
export const START_RESERVES = 100;
export const FX_COST = [0, 12, 25] as const;

export interface ChapterDef {
  n: 1 | 2 | 3;
  title: string;
  kicker: string;
  from: number;
  to: number;
  blurb: string;
  unlocks: string;
}

export const CHAPTERS: ChapterDef[] = [
  { n: 1, title: 'The Inflation Scare', kicker: 'Term I', from: 1, to: 8, unlocks: 'Policy rate and forward guidance',
    blurb: 'Fuel prices are jumping and households have started to expect more of the same. Unemployment is low, the economy is warm, and the Minister would like you not to spoil it. Anchor expectations before they set.' },
  { n: 2, title: 'The Housing Boom', kicker: 'Term II', from: 9, to: 16, unlocks: 'Lending standards (loan-to-value limits) and asset purchases',
    blurb: 'Cheap credit is pouring into property and prices rise every quarter. Inflation looks tame, which is exactly what makes the boom dangerous. Lean on lending standards, and keep asset purchases for the morning after.' },
  { n: 3, title: 'The Currency Run', kicker: 'Term III', from: 17, to: 24, unlocks: 'Exchange-rate defence from the reserves',
    blurb: 'Foreign investors are heading for the exits. The currency is sliding and imported goods are getting dearer. Raising rates hurts borrowers at home; not raising them hurts the currency. Reserves are finite.' },
];

export const chapterOf = (q: number): ChapterDef => CHAPTERS.find((c) => q >= c.from && q <= c.to) ?? CHAPTERS[2];

// ───────────────────────── scenario ─────────────────────────

export interface Scenario {
  shocks: Shock[];
  events: string[]; // newspaper line about the quarter's shock, or ''
}

export function buildScenario(seed: string): Scenario {
  const r = mulberry32(hashSeed(seed, 'scenario'));
  const j = (a: number, spread: number) => a + (r() * 2 - 1) * spread;
  const shocks: Shock[] = Array.from({ length: TOTAL_Q }, () => ({ ...NO_SHOCK }));
  const events: string[] = Array(TOTAL_Q).fill('');
  const at = (q: number) => shocks[q - 1];
  const say = (q: number, s: string) => { events[q - 1] = s; };

  // Chapter 1: supply shock
  for (const q of [1, 2, 3]) at(q).demand = 0.4;
  at(1).energy = 2; say(1, 'Fuel prices tick up as winter stocks run low');
  at(2).energy = j(9, 2); say(2, 'Pipeline outage sends fuel prices sharply higher');
  at(3).energy = j(7, 2); say(3, 'Second refinery fault keeps pump prices climbing');
  at(4).energy = j(3, 1);
  at(6).energy = -2; say(6, 'Fuel prices ease as the pipeline reopens');

  // Chapter 2: housing boom and bust
  const bust = r() < 0.5 ? 14 : 15;
  for (let q = 9; q <= 16; q++) {
    if (q < bust) { at(q).spec = j(2.4, 0.5); at(q).animal = 1.2; }
  }
  say(9, 'Mortgage approvals hit a record as lenders chase market share');
  say(11, 'Auction clearance rates top 90% in the capital');
  at(bust).spec = -12; at(bust).animal = -3; at(bust).demand = -1.2;
  say(bust, 'Developer collapse shakes the property market');
  at(bust + 1).spec = -6; at(bust + 1).demand = -0.6;
  say(bust + 1, 'Buyers vanish from the market as prices fall for a second quarter');

  // Chapter 3: capital flight
  const flight = [-6, -9, -7, -4].map((x) => j(x, 1));
  flight.forEach((x, i) => { at(17 + i).fx = x; });
  say(17, 'Foreign funds start selling government bonds');
  say(18, 'Currency falls through its floor as investors rush out');
  at(18).energy = 3;
  for (let q = 18; q <= 24; q++) at(q).foreignRate = 4.5;
  say(20, 'Importers report cost of goods up by a fifth');
  at(22).fx = 2; at(23).fx = 2;
  say(22, 'Foreign buyers return as the sell-off pauses');
  return { shocks, events };
}

// ───────────────────────── state ─────────────────────────

export interface Flash {
  piQ: number;
  piYoY: number;
  u: number;
  y: number; // staff estimate of the output gap (the true gap is never observed)
  fsi: number;
  H: number;
  fx: number;
  r: number;
}

export interface Reaction { who: 'hawk' | 'dove' | 'minister' | 'press'; text: string }

export interface QuarterLog {
  q: number;
  chapter: 1 | 2 | 3;
  decision: Policy;
  prevRate: number;
  event: string;
  flash: Flash;
  truth: { piQ: number; piYoY: number; u: number; y: number; fsi: number; cred: number; H: number; fx: number; expAvg: number };
  revision: { flash: number; actual: number } | null; // previous quarter's YoY inflation: first flash against the revised figure
  loss: number;
  score: number;
  credDelta: number;
  credNotes: string[];
  bcDelta: number;
  attribution: Attribution;
  headline: string;
  deck: string;
  reactions: Reaction[];
  presser: { who: string; q: string; a: string }[];
}

export interface Outcome {
  kind: 'completed' | 'dismissed' | 'crisis' | 'unanchored' | 'vote';
  quarter: number;
  reason: string;
}

export interface GameState {
  seed: string;
  quarter: number; // the quarter being decided (briefing) or just decided (debrief)
  phase: 'briefing' | 'debrief' | 'over';
  world: World;
  scenario: Scenario;
  history: QuarterLog[];
  flash: Flash;
  prev: Policy;
  boardConf: number;
  reserves: number;
  outcome: Outcome | null;
}

function makeFlash(seed: string, q: number, m: Macro): Flash {
  const r = mulberry32(hashSeed(seed, 'flash', q));
  return {
    piQ: m.piQ + 0.5 * gauss(r),
    piYoY: m.piYoY + 0.35 * gauss(r),
    u: m.u + 0.15 * gauss(r),
    y: m.y + 1.0 * gauss(r),
    fsi: clamp(m.fsi + 3 * gauss(r), 0, 100),
    H: m.H,
    fx: m.fx,
    r: m.r,
  };
}

export function newGame(seed: string): GameState {
  const world = createWorld(hashSeed(seed, 'world'), { r: 3, piYoY: 3.1, expAvg: 2.6, cred: 70 });
  world.macro.r = 3;
  return {
    seed,
    quarter: 1,
    phase: 'briefing',
    world,
    scenario: buildScenario(seed),
    history: [],
    flash: makeFlash(seed, 0, world.macro),
    prev: { ...NEUTRAL_POLICY, rate: 3 },
    boardConf: 70,
    reserves: START_RESERVES,
    outcome: null,
  };
}

// ───────────────────────── advisors ─────────────────────────

export interface Advisor {
  id: 'hawk' | 'dove' | 'tech' | 'minister';
  name: string;
  title: string;
  rec: number;
  quote: string;
}

const snap = (x: number) => clamp(Math.round(x * 4) / 4, RATE_MIN, RATE_MAX);
const bp = (x: number) => `${Math.abs(Math.round(x * 100))} basis points`;

export function advisors(s: GameState): Advisor[] {
  const f = s.flash;
  const prev = s.prev.rate;
  const dp = f.piYoY - TARGET_INFL;
  const du = f.u - NAT_U;
  // Advisers smooth their recommendations: no committee jumps by three points in one meeting.
  const sm = (target: number) => snap(prev + clamp(0.6 * (target - prev), -1, 1));
  const hawk = sm(3.5 + 2.0 * dp - 0.2 * du);
  const dove = sm(3.5 + 0.8 * dp - 0.7 * du);
  const tech = sm(3.5 + 1.5 * dp - 0.5 * du);
  const election = ELECTION_QUARTERS.includes(s.quarter);
  const minister = snap(election ? Math.min(dove, prev - 0.5) : dove - 0.25);
  const move = (rec: number) => (rec > prev + 0.01 ? `a rise of ${bp(rec - prev)}` : rec < prev - 0.01 ? `a cut of ${bp(prev - rec)}` : 'no change');
  return [
    { id: 'hawk', name: 'Marguerite Voss', title: 'Deputy Governor, Prices', rec: hawk,
      quote: `Inflation is ${f.piYoY.toFixed(1)}% against a 2% goal. I would favour ${move(hawk)}. Credibility is cheap to keep and dear to rebuild.` },
    { id: 'dove', name: 'Dev Rao', title: 'Deputy Governor, Employment', rec: dove,
      quote: `Unemployment is ${f.u.toFixed(1)}%. ${du > 0.3 ? 'People are losing jobs' : 'Jobs are holding up'}; I would favour ${move(dove)} and would not break what is working.` },
    { id: 'tech', name: 'Prof. Elena Marsh', title: 'Chief Economist', rec: tech,
      quote: `The staff rule says ${move(tech)}. The output gap is estimated at ${f.y.toFixed(1)}%, but that figure is revised heavily and I would not lean on it.` },
    { id: 'minister', name: 'Tobias Hale', title: 'Finance Minister', rec: minister,
      quote: election
        ? `The country votes soon. A cut would be welcome. I am not telling you how to do your job, Governor, I am only observing the calendar.`
        : `The Treasury would be glad of lower rates. Mortgage holders are my constituents too.` },
  ];
}

// ───────────────────────── commit one decision ─────────────────────────

export function lossOf(piYoY: number, u: number, fsi: number): number {
  return (piYoY - TARGET_INFL) ** 2 + 0.5 * (u - NAT_U) ** 2 + 0.003 * Math.max(0, fsi - 25) ** 2;
}
export const scoreOf = (loss: number): number => 100 * Math.exp(-loss / 10);

export function sanitize(s: GameState, d: Policy): Policy {
  const c = chapterOf(s.quarter).n;
  const cost = FX_COST[d.fxInt];
  return {
    rate: snap(d.rate),
    guidance: d.guidance,
    macropru: c >= 2 ? d.macropru : 1,
    qe: c >= 2 ? d.qe : 0,
    fxInt: c >= 3 && s.reserves >= cost ? d.fxInt : 0,
  };
}

export function commit(s: GameState, decision: Policy): GameState {
  if (s.phase !== 'briefing') return s;
  const q = s.quarter;
  const chapter = chapterOf(q);
  const d = sanitize(s, decision);
  const prevMacro = s.world.macro;
  const shock = { ...s.scenario.shocks[q - 1] };
  const reservesAfter = s.reserves - FX_COST[d.fxInt];
  if (reservesAfter <= 0 && prevMacro.fx < 85) shock.fx -= 2; // speculators smell blood

  // say-do credibility
  const credNotes: string[] = [];
  let credDelta = 0;
  const move = d.rate - s.prev.rate;
  const g = s.prev.guidance;
  if (q > 1) {
    if (g === 1) {
      if (move >= 0.25) { credDelta += 1.5; credNotes.push('You did what you signalled: rates up (+1.5)'); }
      else if (move > -0.01) { credDelta -= 1.5; credNotes.push('You signalled a rise and held (-1.5)'); }
      else { credDelta -= 5; credNotes.push('You signalled a rise and cut (-5)'); }
    } else if (g === -1) {
      if (move <= -0.25) { credDelta += 1.5; credNotes.push('You did what you signalled: rates down (+1.5)'); }
      else if (move < 0.01) { credDelta -= 1.5; credNotes.push('You signalled a cut and held (-1.5)'); }
      else { credDelta -= 5; credNotes.push('You signalled a cut and raised (-5)'); }
    } else if (Math.abs(move) >= 1) { credDelta -= 2; credNotes.push('A full-point move with no warning surprised markets (-2)'); }
  }
  const election = ELECTION_QUARTERS.includes(q);
  if (election && move < 0 && s.flash.piYoY > 3.5) { credDelta -= 2; credNotes.push('Cutting before an election with inflation high looks political (-2)'); }
  if (d.qe > 0 && s.flash.piYoY > 4) { credDelta -= 1.5 * d.qe; credNotes.push(`Printing money while inflation is above 4% (-${(1.5 * d.qe).toFixed(1)})`); }

  const seed = hashSeed(s.seed, 'step', q);
  const { world } = step(s.world, d, shock, seed, { credDelta });
  const m = world.macro;
  const attribution = attribute(s.world, d, shock, seed, m, { credDelta });

  const loss = lossOf(m.piYoY, m.u, m.fsi);
  const score = scoreOf(loss);
  let bcDelta = (score - 55) / 12;
  if (m.fsi > 70) bcDelta -= 2;
  if (election && move > 0) bcDelta -= 2;
  const boardConf = clamp(s.boardConf + bcDelta, 0, 100);

  const flash = makeFlash(s.seed, q, m);
  const lastLog = s.history[s.history.length - 1];
  const revision = lastLog ? { flash: lastLog.flash.piYoY, actual: lastLog.truth.piYoY } : null;

  const base: QuarterLog = {
    q, chapter: chapter.n, decision: d, prevRate: s.prev.rate, event: s.scenario.events[q - 1], flash,
    truth: { piQ: m.piQ, piYoY: m.piYoY, u: m.u, y: m.y, fsi: m.fsi, cred: m.cred, H: m.H, fx: m.fx, expAvg: m.expAvg },
    revision, loss, score, credDelta, credNotes, bcDelta, attribution,
    headline: '', deck: '', reactions: [], presser: [],
  };
  const log = writeCopy(s, base, advisors(s));

  // outcomes
  let outcome: Outcome | null = null;
  const cs = [...s.history, log].filter((l) => l.chapter === chapter.n);
  const chAvg = cs.reduce((t, l) => t + l.score, 0) / cs.length;
  if (m.fsi >= 95) outcome = { kind: 'crisis', quarter: q, reason: 'The financial system seized up. You resigned as the banks went to the government for help.' };
  else if (m.cred <= 5) outcome = { kind: 'unanchored', quarter: q, reason: 'Nobody believes the Bank any more. Expectations have come loose and the board has removed you.' };
  else if (boardConf <= 0) outcome = { kind: 'dismissed', quarter: q, reason: 'The board lost confidence in you and the Minister announced a replacement.' };
  else if (q === chapter.to && q < TOTAL_Q && (chAvg < 40 || boardConf < 25 || m.cred < 20)) {
    outcome = { kind: 'vote', quarter: q, reason: `Your reappointment was voted down at the end of ${chapter.kicker}. ${chAvg < 40 ? 'The term average was too weak.' : boardConf < 25 ? 'The board no longer backs you.' : 'The Bank had lost its credibility.'}` };
  } else if (q === TOTAL_Q) outcome = { kind: 'completed', quarter: q, reason: 'You served all three terms.' };

  return {
    ...s,
    phase: 'debrief',
    world,
    history: [...s.history, log],
    flash,
    prev: d,
    boardConf,
    reserves: Math.max(0, reservesAfter),
    outcome,
  };
}

export function advance(s: GameState): GameState {
  if (s.phase !== 'debrief') return s;
  if (s.outcome) return { ...s, phase: 'over' };
  return { ...s, phase: 'briefing', quarter: s.quarter + 1 };
}

// ───────────────────────── newspaper copy ─────────────────────────

function writeCopy(s: GameState, l: QuarterLog, adv: Advisor[]): QuarterLog {
  const d = l.decision;
  const mv = d.rate - l.prevRate;
  const f = l.flash;
  const pc = `${f.piYoY.toFixed(1)}%`;
  let headline: string;
  if (mv >= 1) headline = `BANK HIKES RATE ${bp(mv).toUpperCase()} TO ${d.rate.toFixed(2)}%`;
  else if (mv > 0.01) headline = `RATE RISES TO ${d.rate.toFixed(2)}% AS PRICES CLIMB`;
  else if (mv <= -1) headline = `GOVERNOR SLASHES RATES ${bp(mv).toUpperCase()} TO ${d.rate.toFixed(2)}%`;
  else if (mv < -0.01) headline = `RATE CUT TO ${d.rate.toFixed(2)}% AS BANK EASES POLICY`;
  else headline = `BANK HOLDS RATE AT ${d.rate.toFixed(2)}%`;
  if (l.truth.fsi > 75) headline = `FEARS FOR BANKS AS ${headline}`;

  const mood = f.piYoY > 4 ? 'Prices are rising much faster than the Bank would like' : f.piYoY > 2.8 ? 'Inflation is running above target' : f.piYoY < 1 ? 'Prices are barely rising and some fear a slump' : 'Inflation is close to the Bank\'s goal';
  const jobs = f.u > 6 ? `unemployment is up at ${f.u.toFixed(1)}%` : f.u < 4.2 ? `jobs are plentiful at ${f.u.toFixed(1)}% unemployment` : `unemployment is ${f.u.toFixed(1)}%`;
  const deck = `${mood} (${pc}) and ${jobs}.${l.event ? ' ' + l.event + '.' : ''}`;

  const react: Reaction[] = [];
  const near = (a: Advisor) => Math.abs(a.rec - d.rate) <= 0.25;
  const [hawk, dove, , min] = adv;
  react.push({ who: 'hawk', text: near(hawk) ? 'A sound decision. It protects the currency of our word.' : d.rate < hawk.rec ? `I dissent. Inflation needed a firmer hand than ${d.rate.toFixed(2)}%.` : 'This is more than the data justified.' });
  react.push({ who: 'dove', text: near(dove) ? 'A fair balance. Jobs and prices both matter.' : d.rate > dove.rec ? 'We are taxing the unemployed to prove a point.' : 'I would not have gone this far.' });
  react.push({ who: 'minister', text: near(min) ? 'The government welcomes the decision.' : d.rate > min.rec ? 'The Treasury is disappointed. Households will feel this.' : 'The Bank has its own mandate, of course.' });
  if (l.credDelta <= -3) react.push({ who: 'press', text: 'Ines Calder, The Ledger: "The Governor said one thing and did another. Markets noticed."' });

  const presser: QuarterLog['presser'] = [];
  const stance = d.guidance === 1 ? 'We are prepared to raise rates further if needed.' : d.guidance === -1 ? 'We expect to ease policy if conditions allow.' : 'We will follow the data and keep every option open.';
  presser.push({
    who: 'Ines Calder, The Ledger',
    q: f.piYoY > 3 ? `Governor, inflation is ${pc}. Why should anyone believe the 2% target?` : f.u > 5.8 ? `Governor, ${f.u.toFixed(1)}% unemployment is a human cost. Did you move too far?` : 'Governor, are you satisfied with where the economy is heading?',
    a: `${mv > 0.01 ? 'We raised rates because' : mv < -0.01 ? 'We cut rates because' : 'We held rates because'} the balance of risks called for it. ${stance}`,
  });
  const second = s.quarter >= 17 ? { who: 'Raj Mehta, Harbour Radio', q: `The currency is at ${l.truth.fx.toFixed(0)}. Will the Bank defend it?`, a: d.fxInt > 0 ? 'We have used reserves to steady the market. They are not unlimited.' : 'The exchange rate is not a target. We watch its effect on prices.' }
    : s.quarter >= 9 ? { who: 'Raj Mehta, Harbour Radio', q: `House prices are ${l.truth.H > 105 ? 'racing ahead' : 'under pressure'}. Is the Bank asleep?`, a: d.macropru === 2 ? 'We have tightened lending standards precisely for this reason.' : 'We are watching household debt closely, as the staff will confirm.' }
    : { who: 'Raj Mehta, Harbour Radio', q: 'What do you say to families paying more at the pump?', a: 'Fuel is a supply problem that rates cannot fix directly. Our job is to stop it spreading into wages and prices.' };
  presser.push(second);
  return { ...l, headline, deck, reactions: react, presser };
}

// ───────────────────────── final report ─────────────────────────

export type FinalGrade = 'S' | 'A' | 'B' | 'C' | 'F';
export const GRADE_CUTS = { S: 80, A: 70, B: 60, C: 48 } as const;

export interface Report {
  grade: FinalGrade;
  avgScore: number;
  quartersServed: number;
  chapterScores: { chapter: 1 | 2 | 3; avg: number | null }[];
  avgInflationGap: number;
  avgUnemploymentGap: number;
  peakStress: number;
  minCred: number;
}

export function report(s: GameState): Report {
  const h = s.history;
  const n = h.length || 1;
  const avg = h.reduce((t, l) => t + l.score, 0) / n;
  const completed = s.outcome?.kind === 'completed';
  const grade: FinalGrade = !completed ? 'F' : avg >= GRADE_CUTS.S ? 'S' : avg >= GRADE_CUTS.A ? 'A' : avg >= GRADE_CUTS.B ? 'B' : avg >= GRADE_CUTS.C ? 'C' : 'F';
  return {
    grade,
    avgScore: avg,
    quartersServed: h.length,
    chapterScores: ([1, 2, 3] as const).map((c) => {
      const xs = h.filter((l) => l.chapter === c);
      return { chapter: c, avg: xs.length ? xs.reduce((t, l) => t + l.score, 0) / xs.length : null };
    }),
    avgInflationGap: h.reduce((t, l) => t + Math.abs(l.truth.piYoY - TARGET_INFL), 0) / n,
    avgUnemploymentGap: h.reduce((t, l) => t + Math.abs(l.truth.u - NAT_U), 0) / n,
    peakStress: Math.max(0, ...h.map((l) => l.truth.fsi)),
    minCred: Math.min(100, ...h.map((l) => l.truth.cred)),
  };
}
