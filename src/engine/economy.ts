/**
 * Rate Setter: agent-based economy.
 *
 * 10,000 households and 1,000 firms, stored as typed arrays (struct-of-arrays).
 * One call to `step` advances one quarter. It is pure and deterministic: the same
 * world, policy, shock and seed always give the same result, which is what makes
 * counterfactual attribution possible (re-run the quarter with one force removed).
 */
import { clamp, gauss, mulberry32 } from './rng';

export const N_HH = 10_000;
export const N_FIRMS = 1_000;
export const TARGET_INFL = 2;
export const NAT_U = 5;
export const NEUTRAL_REAL = 1.5;
export const BASE_RATE = 3.5;
export const RATE_MIN = 0;
export const RATE_MAX = 12;

export interface Households {
  mpc: Float64Array; // marginal propensity to consume
  inc: Float64Array; // relative real income when employed (mean 1)
  debt: Float64Array; // mortgage-style debt in annual incomes
  sav: Float64Array; // savings in annual incomes
  vshare: Float64Array; // share of debt that reprices each quarter
  eff: Float64Array; // effective borrowing rate, %
  exp: Float64Array; // expected inflation, % a year
  lambda: Float64Array; // attention to recent inflation
  energyW: Float64Array; // exposure to fuel and food prices
  emp: Uint8Array;
  owner: Uint8Array;
}

export interface Firms {
  p: Float64Array;
  w: Float64Array;
  A: Float64Array; // productivity
  L: Float64Array; // employment relative to baseline
  mu: Float64Array; // desired markup
  theta: Float64Array; // probability of repricing this quarter
  en: Float64Array; // energy cost share
  imp: Float64Array; // imported-input share
  exp: Float64Array; // expected inflation, % a year
}

export interface Macro {
  t: number;
  P: number;
  P0: number;
  priceHist: number[]; // last four price levels, oldest first
  piQ: number; // annualised quarter-on-quarter inflation, %
  piYoY: number;
  y: number; // output gap, %
  u: number; // unemployment, %
  r: number; // policy rate, %
  rLong: number;
  H: number; // real house price index (100 = neutral)
  dH: number;
  Hpeak: number;
  fx: number; // trade-weighted exchange rate (100 = neutral)
  cred: number; // central-bank credibility, 0-100
  expAvg: number; // mean expected inflation across households and firms
  fsi: number; // financial stress index, 0-100
  wReal: number; // real wage index
  energy: number; // energy cost index (1 = normal)
  distress: number; // share of borrowers with a debt-service ratio above 33%
}

export interface World {
  macro: Macro;
  hh: Households;
  firms: Firms;
  C0: number; // baseline consumption, for normalisation
}

export interface Policy {
  rate: number;
  guidance: -1 | 0 | 1; // +1 signals hikes ahead (hawkish), -1 signals cuts
  macropru: 0 | 1 | 2; // 0 loose, 1 normal, 2 tight lending standards
  qe: 0 | 1 | 2 | 3; // asset purchases
  fxInt: 0 | 1 | 2; // exchange-rate defence
}

export interface Shock {
  energy: number; // % jump in energy costs this quarter
  demand: number; // pp of demand added or removed
  animal: number; // investment sentiment
  spec: number; // housing speculation, pp of house-price growth
  fx: number; // capital-flow shock to the exchange rate, index points
  foreignRate: number; // foreign policy rate
}

export interface StepOpts {
  anchorExp?: boolean; // counterfactual: expectations pinned at target
  noEnergy?: boolean; // counterfactual: energy costs normal
  neutralSlack?: boolean; // counterfactual: no output or labour-market slack
  neutralFx?: boolean; // counterfactual: no exchange-rate pass-through
  credDelta?: number; // say-do credibility adjustment from the campaign layer
}

export const NO_SHOCK: Shock = { energy: 0, demand: 0, animal: 0, spec: 0, fx: 0, foreignRate: 3 };
export const NEUTRAL_POLICY: Policy = { rate: BASE_RATE, guidance: 0, macropru: 1, qe: 0, fxInt: 0 };

// ───────────────────────── construction ─────────────────────────

function lognormal(r: () => number, mu: number, sigma: number): number {
  return Math.exp(mu + sigma * gauss(r));
}

export interface StartConditions {
  r: number;
  piYoY: number;
  expAvg: number;
  cred: number;
}

export function createWorld(seed: number, start: StartConditions): World {
  const r = mulberry32(seed);
  const hh: Households = {
    mpc: new Float64Array(N_HH), inc: new Float64Array(N_HH), debt: new Float64Array(N_HH), sav: new Float64Array(N_HH),
    vshare: new Float64Array(N_HH), eff: new Float64Array(N_HH), exp: new Float64Array(N_HH), lambda: new Float64Array(N_HH),
    energyW: new Float64Array(N_HH), emp: new Uint8Array(N_HH), owner: new Uint8Array(N_HH),
  };
  let incSum = 0;
  for (let i = 0; i < N_HH; i++) {
    hh.inc[i] = lognormal(r, 0, 0.45);
    incSum += hh.inc[i];
  }
  for (let i = 0; i < N_HH; i++) {
    hh.inc[i] /= incSum / N_HH;
    hh.mpc[i] = r() < 0.3 ? 0.95 : clamp(0.72 + 0.12 * gauss(r), 0.45, 0.92);
    hh.owner[i] = r() < 0.62 ? 1 : 0;
    hh.debt[i] = hh.owner[i] ? clamp(lognormal(r, Math.log(2.2), 0.5), 0.3, 6) : 0;
    hh.sav[i] = lognormal(r, Math.log(hh.owner[i] ? 0.5 : 1.0), 0.8);
    hh.vshare[i] = clamp(0.5 + 0.22 * gauss(r), 0.1, 0.95);
    hh.eff[i] = 5.3;
    hh.exp[i] = clamp(start.expAvg + 0.35 * gauss(r), 0, 8);
    hh.lambda[i] = 0.12 + 0.38 * r();
    hh.energyW[i] = 0.5 + r();
    hh.emp[i] = r() < 0.95 ? 1 : 0;
  }

  const firms: Firms = {
    p: new Float64Array(N_FIRMS), w: new Float64Array(N_FIRMS), A: new Float64Array(N_FIRMS), L: new Float64Array(N_FIRMS),
    mu: new Float64Array(N_FIRMS), theta: new Float64Array(N_FIRMS), en: new Float64Array(N_FIRMS), imp: new Float64Array(N_FIRMS),
    exp: new Float64Array(N_FIRMS),
  };
  let pSum = 0;
  for (let j = 0; j < N_FIRMS; j++) {
    firms.A[j] = clamp(1 + 0.15 * gauss(r), 0.6, 1.6);
    firms.w[j] = 1;
    firms.L[j] = 1;
    firms.mu[j] = 1.15 + 0.2 * r();
    firms.theta[j] = 0.22 + 0.36 * r();
    firms.en[j] = 0.04 + 0.26 * r();
    firms.imp[j] = 0.35 * r() * r() * 1.8;
    firms.exp[j] = clamp(start.expAvg + 0.3 * gauss(r), 0, 8);
    const k = (1 + (0.3 * start.expAvg) / 400) / (1 + 0.005);
    const lag = firms.theta[j] / (1 - (1 - firms.theta[j]) * k); // stationary ratio of price to desired price
    firms.p[j] = ((firms.mu[j] * firms.w[j]) / firms.A[j]) * lag;
    pSum += firms.p[j];
  }
  const P0 = pSum / N_FIRMS;
  const hist = [1, 2, 3, 4].map((k) => P0 / Math.pow(1 + start.piYoY / 100, (5 - k) / 4));
  const macro: Macro = {
    t: 0, P: P0, P0, priceHist: hist, piQ: start.piYoY, piYoY: start.piYoY, y: 0, u: NAT_U, r: start.r, rLong: start.r + 0.7,
    H: 100, dH: 0, Hpeak: 100, fx: 100, cred: start.cred, expAvg: start.expAvg, fsi: 10, wReal: 1, energy: 1, distress: 0,
  };
  const world: World = { macro, hh, firms, C0: 1 };
  world.C0 = consumption(hh, macro, 5.3, start.r, 1, 100).spend;
  return world;
}

export function cloneWorld(w: World): World {
  const h = w.hh;
  const f = w.firms;
  const cp = <T extends Float64Array | Uint8Array>(a: T): T => a.slice() as T;
  return {
    macro: { ...w.macro, priceHist: [...w.macro.priceHist] },
    C0: w.C0,
    hh: {
      mpc: cp(h.mpc), inc: cp(h.inc), debt: cp(h.debt), sav: cp(h.sav), vshare: cp(h.vshare), eff: cp(h.eff), exp: cp(h.exp),
      lambda: cp(h.lambda), energyW: cp(h.energyW), emp: cp(h.emp), owner: cp(h.owner),
    },
    firms: {
      p: cp(f.p), w: cp(f.w), A: cp(f.A), L: cp(f.L), mu: cp(f.mu), theta: cp(f.theta), en: cp(f.en), imp: cp(f.imp), exp: cp(f.exp),
    },
  };
}

// ───────────────────────── household demand ─────────────────────────

const SIGMA_SUBST = 0.008; // consumption response to the real rate, per pp
const WEALTH_EFFECT = 0.1;

function consumption(h: Households, m: Macro, _mTarget: number, rate: number, wReal: number, H: number): { spend: number; distress: number } {
  let spend = 0;
  let debtors = 0;
  let distressed = 0;
  const hrel = H / 100;
  for (let i = 0; i < N_HH; i++) {
    const incYear = h.inc[i] * wReal;
    const incQ = (incYear / 4) * (h.emp[i] ? 1 : 0.45);
    const icost = (h.debt[i] * h.eff[i]) / 400;
    const iinc = (h.sav[i] * Math.max(0, rate)) / 400;
    const disp = incQ - icost + iinc;
    if (h.debt[i] > 0) {
      debtors++;
      if (icost / (incYear / 4) > 0.33) distressed++;
    }
    const subst = clamp(1 - SIGMA_SUBST * (rate - h.exp[i] - NEUTRAL_REAL), 0.6, 1.4);
    const wealth = h.owner[i] ? 1 + WEALTH_EFFECT * (hrel - 1) : 1;
    spend += h.mpc[i] * Math.max(0, disp) * subst * wealth;
  }
  void m;
  return { spend, distress: debtors ? distressed / debtors : 0 };
}

// ───────────────────────── one quarter ─────────────────────────

export interface StepInfo {
  D: number;
  consumption: number;
  investment: number;
  netExports: number;
}

export function step(prev: World, pol: Policy, sh: Shock, seed: number, opts: StepOpts = {}): { world: World; info: StepInfo } {
  const w = cloneWorld(prev);
  const m0 = prev.macro;
  const m = w.macro;
  const h = w.hh;
  const f = w.firms;
  const rng = mulberry32(seed);
  const credEff = m0.cred / 100;

  if (opts.anchorExp) {
    h.exp.fill(TARGET_INFL);
    f.exp.fill(TARGET_INFL);
  }

  // 1. Interest-rate transmission and forward guidance
  const neutralNom = NEUTRAL_REAL + m0.expAvg;
  const guidanceShift = pol.guidance * 0.5 * (0.4 + 0.6 * credEff);
  const expPath = pol.rate + 0.3 * (neutralNom - pol.rate) + guidanceShift;
  const termPrem = 0.7 - 0.3 * pol.qe;
  const rLong = expPath + termPrem;
  const mTarget = 0.7 * pol.rate + 0.3 * rLong + 1.6;

  // 2. Exchange rate
  const fxTarget = 100 + 3 * (pol.rate - m0.piYoY - (sh.foreignRate - 2) - 0.5) + 0.12 * (m0.cred - 70);
  const dFx = 0.3 * (fxTarget - m0.fx) + sh.fx - 0.8 * pol.qe + 3.5 * pol.fxInt + 0.5 * gauss(rng);
  m.fx = clamp(m0.fx + dFx, 50, 140);

  // 3. Housing
  const Htarget = 100 - 9 * (mTarget - 5.3) + 3 * pol.qe - 3 * (pol.macropru - 1) + 0.8 * m0.y;
  const spec = sh.spec > 0 ? sh.spec * (1 - 0.35 * (pol.macropru - 1)) : sh.spec; // tighter lending standards temper speculation
  const dH = clamp(0.25 * (Htarget - m0.H) + 0.4 * m0.dH + spec + 0.4 * gauss(rng), -12, 12);
  m.dH = dH;
  m.H = m0.H * (1 + dH / 100);
  m.Hpeak = Math.max(m0.Hpeak, m.H);

  // 4. Expectations (households and firms)
  const anchor = 0.02 + 0.2 * credEff * credEff;
  const gEff = pol.guidance * 0.35 * credEff;
  const base = 0.5 * m0.piQ + 0.5 * m0.piYoY;
  const energyPulse = 0.25 * sh.energy;
  let expSum = 0;
  for (let i = 0; i < N_HH; i++) {
    h.eff[i] += h.vshare[i] * (mTarget - h.eff[i]);
    const perceived = base + h.energyW[i] * energyPulse + 0.4 * gauss(rng);
    h.exp[i] = clamp(h.exp[i] + h.lambda[i] * (perceived - h.exp[i]) + anchor * (TARGET_INFL - h.exp[i]) - gEff * (0.5 + h.lambda[i]), -1, 15);
    expSum += h.exp[i];
  }
  let expFSum = 0;
  for (let j = 0; j < N_FIRMS; j++) {
    const perceived = base + 0.3 * sh.energy;
    f.exp[j] = clamp(f.exp[j] + 0.35 * (perceived - f.exp[j]) + anchor * (TARGET_INFL - f.exp[j]) - gEff * 0.7, -1, 15);
    expFSum += f.exp[j];
  }
  const expHH = expSum / N_HH;
  const expAvg = 0.6 * expHH + 0.4 * (expFSum / N_FIRMS);

  // 5. Aggregate demand
  const cons = consumption(h, m0, mTarget, pol.rate, m0.wReal, m.H);
  const Cidx = cons.spend / w.C0;
  const realLong = rLong - expAvg;
  const I = 1 - 0.03 * (realLong - (NEUTRAL_REAL + 0.7)) + 0.3 * (Cidx - 1) + 0.4 * (sh.animal / 100);
  const NX = 1 - 0.4 * (m.fx / 100 - 1);
  const D = 0.6 * Cidx + 0.2 * I + 0.15 + 0.05 * NX + sh.demand / 100;
  m.y = (D - 1) * 100;

  // 6. Firms: wages, prices, labour
  const slackU = opts.neutralSlack ? NAT_U : m0.u;
  const yUsed = opts.neutralSlack ? 0 : m.y;
  const energyIdx = opts.noEnergy ? 1 : 1 + (m0.energy - 1) * 0.88 + sh.energy / 100;
  m.energy = 1 + (m0.energy - 1) * 0.88 + sh.energy / 100;
  const fxF = opts.neutralFx ? 1 : 100 / m.fx;
  const gw = 1.0 + 0.4 * expAvg + 0.4 * m0.piYoY + 0.2 * TARGET_INFL + 0.35 * (NAT_U - slackU);
  let pSum = 0;
  let wSum = 0;
  let aSum = 0;
  for (let j = 0; j < N_FIRMS; j++) {
    f.w[j] *= 1 + gw / 400 + 0.0015 * gauss(rng);
    f.A[j] *= 1 + 0.01 / 4;
    const mc = (f.w[j] / f.A[j]) * (1 + f.en[j] * (energyIdx - 1)) * (1 + f.imp[j] * (fxF - 1));
    const pstar = f.mu[j] * (1 + 0.45 * (yUsed / 100)) * mc;
    if (rng() < f.theta[j]) f.p[j] = pstar;
    else f.p[j] *= 1 + (0.3 * f.exp[j]) / 400;
    pSum += f.p[j];
    wSum += f.w[j];
    aSum += f.A[j];
  }
  const Pmean = pSum / N_FIRMS;
  const meanA = aSum / N_FIRMS;
  let shareSum = 0;
  const share = new Float64Array(N_FIRMS);
  for (let j = 0; j < N_FIRMS; j++) {
    share[j] = Math.pow(f.p[j] / Pmean, -3);
    shareSum += share[j];
  }
  const x = new Float64Array(N_FIRMS);
  let xSum = 0;
  for (let j = 0; j < N_FIRMS; j++) {
    x[j] = share[j] / (shareSum / N_FIRMS) / (f.A[j] / meanA);
    xSum += x[j];
  }
  let LSum = 0;
  for (let j = 0; j < N_FIRMS; j++) {
    const Lstar = 1 + 0.55 * ((D * x[j]) / (xSum / N_FIRMS) - 1);
    f.L[j] += 0.45 * (clamp(Lstar, 0.05, 3) - f.L[j]);
    LSum += f.L[j];
  }
  const empShare = clamp((0.95 * LSum) / N_FIRMS, 0.8, 0.995);
  m.u = (1 - empShare) * 100;

  // 7. Households: move employment flags toward the new aggregate
  const target = Math.round(empShare * N_HH);
  let employed = 0;
  for (let i = 0; i < N_HH; i++) employed += h.emp[i];
  let guard = 0;
  while (employed !== target && guard < N_HH * 20) {
    const i = Math.floor(rng() * N_HH);
    if (employed < target && !h.emp[i]) {
      h.emp[i] = 1;
      employed++;
    } else if (employed > target && h.emp[i]) {
      h.emp[i] = 0;
      employed--;
    }
    guard++;
  }

  // 8. Prices and inflation
  m.t = m0.t + 1;
  m.P = Pmean;
  m.piQ = (Math.pow(m.P / m0.P, 4) - 1) * 100;
  m.priceHist = [...m0.priceHist.slice(1), m0.P];
  m.piYoY = (m.P / m.priceHist[0] - 1) * 100;
  m.wReal = wSum / N_FIRMS / (m.P / m.P0) / Math.pow(1.0025, m.t); // detrended by productivity
  m.r = pol.rate;
  m.rLong = rLong;
  m.expAvg = expAvg;

  // 9. Credibility
  const dev = m.piYoY - TARGET_INFL;
  let dc = 0;
  if (Math.abs(dev) <= 1) dc += 1.2;
  else if (dev > 1) dc -= Math.min(5, 1.1 * (dev - 1));
  else dc -= Math.min(3, 0.6 * (-dev - 1));
  m.cred = clamp(m0.cred + dc + (opts.credDelta ?? 0), 0, 100);

  // 10. Financial stress
  const distress = cons.distress;
  m.distress = distress;
  const Hdrop = Math.max(0, ((m.Hpeak - m.H) / m.Hpeak) * 100);
  const fsiTarget = 8 + 130 * distress + 2.0 * Hdrop + 0.9 * Math.max(0, 95 - m.fx) + 0.25 * Math.max(0, m.H - 110);
  m.fsi = clamp(0.6 * m0.fsi + 0.4 * fsiTarget, 0, 100);

  return { world: w, info: { D, consumption: Cidx, investment: I, netExports: NX } };
}

// ───────────────────────── explainability ─────────────────────────

export interface Attribution {
  expectations: number;
  energy: number;
  slack: number;
  fx: number;
  residual: number; // inertia, price stickiness and everything else
  total: number; // inflation above target, annualised quarter-on-quarter
  yourMove: { output: number; inflation: number }; // effect of choosing this rate instead of holding the previous one
}

/** Counterfactual attribution: re-run the same quarter with one force removed and take the difference. */
export function attribute(prev: World, pol: Policy, sh: Shock, seed: number, actual: Macro, opts: StepOpts): Attribution {
  const run = (o: StepOpts, p: Policy = pol) => step(prev, p, sh, seed, { ...opts, ...o, credDelta: opts.credDelta }).world.macro;
  const exp = actual.piQ - run({ anchorExp: true }).piQ;
  const energy = actual.piQ - run({ noEnergy: true }).piQ;
  const slack = actual.piQ - run({ neutralSlack: true }).piQ;
  const fx = actual.piQ - run({ neutralFx: true }).piQ;
  const hold = run({}, { ...pol, rate: prev.macro.r });
  const total = actual.piQ - TARGET_INFL;
  return {
    expectations: exp,
    energy,
    slack,
    fx,
    residual: total - exp - energy - slack - fx,
    total,
    yourMove: { output: actual.y - hold.y, inflation: actual.piQ - hold.piQ },
  };
}
