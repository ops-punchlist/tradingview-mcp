#!/usr/bin/env node
/**
 * Session 5 — Conviction scoring from KV dashboard:state → updates scoring + optional Telegram.
 * Env: same KV vars as dashboard_push; TELEGRAM_* optional.
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { kvGetJson, kvPutJson, kvEnvOk } from './kv_cloudflare.mjs';
import { sendProposalCard } from './telegram_bot.mjs';

export const RULES = {
  MIN_SCORE_TO_PROPOSE: 50,
  MIN_SIGNALS_REQUIRED: 3,
  MIN_RR_RATIO: 2.0,
  MAX_STOP_LOSS_PCT: 0.15,
  TIER1_TARGET_GAIN_MIN_PCT: 30,
  TIER1_TARGET_GAIN_MAX_PCT: 35,
  TIER1_CLOSE_PCT: 0.5,
  MAX_LEVERAGE_PAPER: 3,
  MAX_LEVERAGE_LIVE_CEILING: 5,
  // Compare to %/hr from (kraken fundingRate USD/h) / btc.price * 100
  FUNDING_RATE_LONG_BLOCK_PCT_PER_HR: 0.05,
  MAX_POSITION_SIZE: 0.75,
  MAX_CONCURRENT_POSITIONS: 3,
  CONSECUTIVE_LOSSES_FOR_PAUSE: 2,
  CONSECUTIVE_LOSS_PAUSE_HOURS: 48,
  DRAWDOWN_FULL_STOP_PCT: 0.25,
  PROPOSAL_DEDUP_HOURS: 4,
};

const DEFAULT_TRADE_STATE = () => ({
  consecutive_losses: 0,
  pause_until: null,
  bankroll_current: 1000,
  bankroll_starting: 1000,
  total_trades: 0,
  total_wins: 0,
  sats_accumulated: 0,
  last_updated: new Date().toISOString(),
});

function num(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.+-eE]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Kraken PF_XBTUSD `fundingRate` is USD per contract per hour (signed).
 * %/hr for strategy gates: (fundingRate / btcSpotUsd) * 100 — use `btc.price` from dashboard:state.
 */
function fundingPctPerHr(rateRaw, btcSpotUsd) {
  if (rateRaw == null || rateRaw === '') return null;
  const rate = Number(rateRaw);
  const px = num(btcSpotUsd);
  if (!Number.isFinite(rate) || px == null || px <= 0) return null;
  return (rate / px) * 100;
}

function findStudyValues(chart) {
  const ind = chart?.indicators;
  if (!Array.isArray(ind)) return [];
  return ind;
}

function studyValuesMap(chart, needle) {
  const n = needle.toLowerCase();
  for (const row of findStudyValues(chart)) {
    if (String(row?.name || '').toLowerCase().includes(n)) return row?.values || {};
  }
  return {};
}

function rsiBias(chart) {
  const vals = studyValuesMap(chart, 'rsi');
  const keys = Object.keys(vals);
  let r = null;
  for (const k of keys) {
    const v = num(vals[k]);
    if (v != null && v >= 0 && v <= 100) {
      r = v;
      break;
    }
  }
  if (r == null) return 'neutral';
  if (r > 50) return 'bullish';
  if (r < 50) return 'bearish';
  return 'neutral';
}

function macdBias(chart) {
  const vals = studyValuesMap(chart, 'macd');
  const s = JSON.stringify(vals).toLowerCase();
  if (s.includes('bull') || s.includes('buy')) return 'bullish';
  if (s.includes('bear') || s.includes('sell')) return 'bearish';
  const nums = Object.values(vals)
    .map((x) => num(x))
    .filter((x) => x != null);
  if (nums.length >= 2) {
    const [a, b] = nums;
    if (a > b) return 'bullish';
    if (a < b) return 'bearish';
  }
  return 'neutral';
}

function flattenLevels(chart) {
  const lines = chart?.levels;
  const studies = lines?.studies;
  if (!Array.isArray(studies)) return [];
  const out = [];
  for (const s of studies) {
    const h = s?.horizontal_levels;
    if (Array.isArray(h)) out.push(...h);
  }
  return [...new Set(out)].filter((x) => typeof x === 'number').sort((a, b) => b - a);
}

function ohlcvTrend(chart) {
  const o = chart?.ohlcv;
  const last5 = o?.last_5_bars;
  if (!Array.isArray(last5) || last5.length < 2) return 'neutral';
  const c0 = num(last5[0]?.close);
  const c1 = num(last5[last5.length - 1]?.close);
  if (c0 == null || c1 == null) return 'neutral';
  const ch = (c1 - c0) / c0;
  if (ch > 0.002) return 'bullish';
  if (ch < -0.002) return 'bearish';
  return 'neutral';
}

function dailyProxyFrom4h(chart4h) {
  return ohlcvTrend(chart4h);
}

/** @returns {'bullish'|'bearish'|'neutral'} */
function tfBias(chart, price) {
  const rsi = rsiBias(chart);
  const maVals = studyValuesMap(chart, 'moving average');
  const maKeys = Object.keys(maVals);
  let ma = null;
  for (const k of maKeys) {
    const v = num(maVals[k]);
    if (v != null) {
      ma = v;
      break;
    }
  }
  if (price != null && ma != null) {
    if (rsi === 'bullish' && price > ma) return 'bullish';
    if (rsi === 'bearish' && price < ma) return 'bearish';
  }
  if (rsi === 'bullish' && ma == null) return 'bullish';
  if (rsi === 'bearish' && ma == null) return 'bearish';
  return 'neutral';
}

function factor1Trend(price, chart1h, chart4h) {
  const b1 = tfBias(chart1h, price);
  const b4 = tfBias(chart4h, price);
  const d = dailyProxyFrom4h(chart4h);
  const set = [b1, b4, d].filter((x) => x !== 'neutral');
  const bulls = set.filter((x) => x === 'bullish').length;
  const bears = set.filter((x) => x === 'bearish').length;
  let score = 0;
  let detail = '';
  if (bulls === 3 || bears === 3) {
    score = 25;
    detail = '1H+4H+Daily proxy agree';
  } else if (bulls >= 2 || bears >= 2) {
    score = 15;
    detail = 'Two of three agree';
  } else if (b1 !== 'neutral') {
    score = 5;
    detail = '1H only / mixed higher TFs';
  } else {
    score = 0;
    detail = 'No clear alignment';
  }
  return { score, max: 25, detail, b1, b4, d };
}

function countSignals(price, chart4h) {
  const signals = [];
  const rsi = rsiBias(chart4h);
  const rvals = studyValuesMap(chart4h, 'rsi');
  const r0 = num(Object.values(rvals)[0]);
  if (r0 != null) {
    if (r0 > 55) signals.push('rsi_bull');
    else if (r0 < 45) signals.push('rsi_bear');
  } else if (rsi !== 'neutral') signals.push('rsi_soft');

  const macd = macdBias(chart4h);
  if (macd === 'bullish') signals.push('macd_bull');
  if (macd === 'bearish') signals.push('macd_bear');

  const levels = flattenLevels(chart4h);
  if (price != null && levels.length) {
    const near = levels.some((lv) => Math.abs(lv - price) / price < 0.005);
    if (near) signals.push('fib_or_level');
  }

  const o = chart4h?.ohlcv;
  const bars = o?.last_5_bars;
  if (Array.isArray(bars) && bars.length >= 2 && o?.avg_volume) {
    const lastV = num(bars[bars.length - 1]?.volume);
    if (lastV != null && lastV > o.avg_volume) signals.push('volume');
  }

  const maVals = studyValuesMap(chart4h, 'moving average');
  const vs = Object.values(maVals).map((x) => num(x)).filter((x) => x != null);
  if (vs.length >= 2) {
    const [a, b] = vs;
    if (a > b) signals.push('ma_cross_bull');
    else if (a < b) signals.push('ma_cross_bear');
  }

  return { list: [...new Set(signals)], count: [...new Set(signals)].length };
}

function factor2Confluence(price, chart4h) {
  const { list, count } = countSignals(price, chart4h);
  let score = 0;
  if (count >= 4) score = 25;
  else if (count === 3) {
    const strong = list.some((s) => s.startsWith('rsi_') || s.startsWith('macd_'));
    score = strong ? 18 : 10;
  } else score = 0;
  return {
    score,
    max: 25,
    detail: `${count} signals: ${list.join(', ') || 'none'}`,
    count,
    list,
  };
}

function pickStopTarget(price, direction, levels) {
  if (price == null || !levels.length) return { stop: null, target: null };
  const below = levels.filter((l) => l < price).sort((a, b) => b - a);
  const above = levels.filter((l) => l > price).sort((a, b) => a - b);
  if (direction === 'long') {
    const stop = below[0] ?? null;
    const target = above[0] ?? null;
    return { stop, target };
  }
  const stop = above[0] ?? null;
  const target = below[0] ?? null;
  return { stop, target };
}

function factor3RiskReward(price, direction, chart4h) {
  const levels = flattenLevels(chart4h);
  const { stop, target } = pickStopTarget(price, direction, levels);
  if (stop == null || target == null) {
    return {
      score: 0,
      max: 20,
      detail: 'no technical levels available',
      rr: 0,
      stop,
      target,
      stopPct: null,
      targetPct: null,
    };
  }
  const risk = Math.abs(price - stop) / price;
  const reward = Math.abs(target - price) / price;
  const rr = risk > 0 ? reward / risk : 0;
  let score = 0;
  if (rr >= 3) score = 20;
  else if (rr >= 2.5) score = 15;
  else if (rr >= 2) score = 10;
  else score = 0;
  return {
    score,
    max: 20,
    detail: `R:R ${rr.toFixed(2)}:1 — entry ${price}, stop ${stop}, target ${target}`,
    rr,
    stop,
    target,
    stopPct: risk * 100,
    targetPct: reward * 100,
  };
}

function factor4Funding(rateRaw, direction, btcSpotUsd) {
  const pct = fundingPctPerHr(rateRaw, btcSpotUsd);
  if (pct == null) {
    return {
      score: 8,
      max: 15,
      detail: 'funding %/hr unknown (missing rate or btc.price) — assume neutral 8pts',
      blockLong: false,
    };
  }
  let score = 0;
  if (pct < 0.02) score = 15;
  else if (pct < 0.04) score = 8;
  else if (pct <= 0.05) score = 3;
  else score = 0;
  const blockLong = direction === 'long' && pct > RULES.FUNDING_RATE_LONG_BLOCK_PCT_PER_HR;
  const r = Number(rateRaw);
  const px = num(btcSpotUsd);
  const detail =
    px != null
      ? `${pct.toFixed(6)}%/hr (= ${r} USD/h ÷ $${Math.round(px)})`
      : `${pct.toFixed(6)}%/hr`;
  return {
    score,
    max: 15,
    detail,
    blockLong,
    pct,
  };
}

function macroSignals(macro, btc) {
  const sig = [];
  const fg = macro?.fear_greed;
  if (fg != null) {
    if (fg > 50) sig.push('bull');
    else if (fg >= 25) sig.push('neu');
    else sig.push('bear');
  }
  const sma = btc?.vs_200sma;
  if (sma === 'above') sig.push('bull');
  else if (sma === 'within5pct') sig.push('neu');
  else if (sma === 'below') sig.push('bear');

  const y = macro?.bond_yield_10yr;
  if (y != null) {
    if (y < 4.5) sig.push('bull');
    else if (y <= 5) sig.push('neu');
    else sig.push('bear');
  }
  const oil = macro?.oil_trend;
  if (oil === 'stable' || oil === 'falling') sig.push('bull');
  else if (oil === 'sideways') sig.push('neu');
  else if (oil === 'spiking') sig.push('bear');

  const bulls = sig.filter((x) => x === 'bull').length;
  const neus = sig.filter((x) => x === 'neu').length;
  const bears = sig.filter((x) => x === 'bear').length;
  return { sig, bulls, neus, bears };
}

function factor5Macro(macro, btc, direction) {
  const { sig, bulls, neus, bears } = macroSignals(macro, btc);
  let base = 4;
  if (bulls >= 3) base = 10;
  else if (bulls === 2 && bears <= 1) base = 7;
  else if (bears >= 3) base = 1;
  else base = 4;

  const thesis = macro?.thesis_status || 'neutral';
  let mod = 0;
  if (thesis === 'active') mod = direction === 'long' ? 3 : -3;
  else if (thesis === 'deteriorating') mod = direction === 'long' ? -3 : 3;

  let score = Math.max(0, Math.min(15, base + mod));
  const thesisNegativeForDirection =
    (direction === 'long' && thesis === 'deteriorating') ||
    (direction === 'short' && thesis === 'active');
  const hardDowngrade = bears >= 3 && thesisNegativeForDirection;
  return {
    score,
    max: 15,
    detail: `F&G ${macro?.fear_greed ?? '?'} signals bull=${bulls} neu=${neus} bear=${bears} thesis=${thesis}`,
    hardDowngrade,
    base,
    mod,
  };
}

function gradeFromScore(score) {
  if (score >= 80) return { grade: 'A', win: 0.65, lev: 5, size: 0.75 };
  if (score >= 65) return { grade: 'B', win: 0.55, lev: 3, size: 0.5 };
  if (score >= 50) return { grade: 'C', win: 0.45, lev: 2, size: 0.25 };
  return { grade: null, win: 0, lev: 0, size: 0 };
}

function computeEv(winProb, targetPct, stopPct) {
  const lossProb = 1 - winProb;
  return winProb * targetPct - lossProb * stopPct;
}

async function readLastProposalMeta() {
  const at = await kvGetJson('scoring:last_proposal_at');
  const dir = await kvGetJson('scoring:last_proposal_direction');
  return { at: at ? String(at) : null, dir: dir ? String(dir) : null };
}

async function writeLastProposalMeta(direction) {
  await kvPutJson('scoring:last_proposal_at', new Date().toISOString());
  await kvPutJson('scoring:last_proposal_direction', direction);
}

async function mergeDashboardScoring(patch) {
  const dash = await kvGetJson('dashboard:state');
  if (!dash) {
    console.error('[scoring] dashboard:state missing — run dashboard:push first');
    return;
  }
  dash.scoring = { ...(dash.scoring || {}), ...patch };
  await kvPutJson('dashboard:state', dash);
}

async function main() {
  if (!kvEnvOk()) {
    console.error('[scoring] KV env not configured');
    process.exit(1);
  }

  if (!(await kvGetJson('scoring:trade_state'))) {
    await kvPutJson('scoring:trade_state', DEFAULT_TRADE_STATE());
  }

  let tradeState = (await kvGetJson('scoring:trade_state')) || DEFAULT_TRADE_STATE();
  const now = Date.now();
  if (tradeState.pause_until && Date.parse(tradeState.pause_until) > now) {
    console.log('[scoring] 48hr pause active — skip');
    return;
  }
  const dd =
    tradeState.bankroll_starting > 0
      ? tradeState.bankroll_current / tradeState.bankroll_starting
      : 1;
  if (dd <= 1 - RULES.DRAWDOWN_FULL_STOP_PCT) {
    console.log('[scoring] 25% drawdown — full stop');
    return;
  }

  const state = await kvGetJson('dashboard:state');
  if (!state) {
    console.error('[scoring] No dashboard:state in KV');
    process.exit(1);
  }

  const price = num(state.btc?.price);
  const chart1h = state.chart_1h || {};
  const chart4h = state.chart_4h || {};
  const macro = state.macro || {};
  const btcMeta = state.btc || {};
  const fundingRaw = state.kraken?.funding_rate_current;

  const f1 = factor1Trend(price, chart1h, chart4h);
  let direction = 'long';
  if (f1.b1 === 'bearish' && f1.b4 !== 'bullish') direction = 'short';
  else if (f1.b1 === 'bullish' && f1.b4 !== 'bearish') direction = 'long';
  else if (f1.b4 === 'bullish') direction = 'long';
  else if (f1.b4 === 'bearish') direction = 'short';
  else direction = 'long';

  const f2 = factor2Confluence(price, chart4h);
  const f3 = factor3RiskReward(price, direction, chart4h);
  const f4 = factor4Funding(fundingRaw, direction, price);
  const f5 = factor5Macro(macro, btcMeta, direction);

  let total = f1.score + f2.score + f3.score + f4.score + f5.score;
  let downgraded = false;
  let downgradeReason = null;
  if (f5.hardDowngrade) {
    if (total >= 80) {
      total = Math.min(total, 79);
      downgraded = true;
      downgradeReason = 'macro bearish + thesis negative for direction';
    } else if (total >= 65) {
      total = Math.min(total, 64);
      downgraded = true;
      downgradeReason = 'macro bearish + thesis negative for direction';
    } else if (total >= 50) {
      total = Math.min(total, 49);
      downgraded = true;
      downgradeReason = 'macro bearish + thesis negative for direction';
    }
  }

  const g = gradeFromScore(total);
  const hardStops = [];

  if (f1.b1 !== 'neutral' && f1.b4 !== 'neutral' && f1.b1 !== f1.b4) {
    hardStops.push('1h_not_confirmed_by_4h');
  }
  if (f2.count < RULES.MIN_SIGNALS_REQUIRED) {
    hardStops.push('min_signals');
  }
  if (f3.rr < RULES.MIN_RR_RATIO || f3.score === 0) {
    hardStops.push('min_rr');
  }
  if (f3.stopPct != null && f3.stopPct / 100 > RULES.MAX_STOP_LOSS_PCT) {
    hardStops.push('stop_over_15pct');
  }
  if (f4.blockLong) {
    hardStops.push('funding_block_long');
  }

  const stopPct = f3.stopPct ?? 0;
  let targetPct = f3.targetPct ?? 0;
  if (targetPct < RULES.TIER1_TARGET_GAIN_MIN_PCT) {
    targetPct = (RULES.TIER1_TARGET_GAIN_MIN_PCT + RULES.TIER1_TARGET_GAIN_MAX_PCT) / 2;
  }

  const winProb = g.win;
  const ev = g.grade ? computeEv(winProb, targetPct, stopPct) : -1;

  let generateProposal =
    g.grade &&
    total >= RULES.MIN_SCORE_TO_PROPOSE &&
    ev > 0 &&
    hardStops.length === 0;

  if (hardStops.includes('funding_block_long') && direction === 'long') {
    generateProposal = false;
  }

  const effectiveLev = g.grade ? Math.min(g.lev, RULES.MAX_LEVERAGE_PAPER) : 0;
  const posPct = g.grade ? Math.round(g.size * 100) : 0;

  const result = {
    scored_at: new Date().toISOString(),
    direction,
    score: Math.round(total),
    grade: g.grade,
    ev: g.grade ? Math.round(ev * 100) / 100 : null,
    generate_proposal: generateProposal,
    factors: {
      trend_alignment: { score: f1.score, max: 25, detail: f1.detail },
      signal_confluence: { score: f2.score, max: 25, detail: f2.detail },
      risk_reward: {
        score: f3.score,
        max: 20,
        detail: f3.detail,
      },
      funding_rate: { score: f4.score, max: 15, detail: f4.detail },
      macro_thesis: { score: f5.score, max: 15, detail: f5.detail },
    },
    entry: price,
    stop: f3.stop,
    target_1: f3.target,
    stop_pct: stopPct,
    target_pct: targetPct,
    tier1_target_pct_band: [RULES.TIER1_TARGET_GAIN_MIN_PCT, RULES.TIER1_TARGET_GAIN_MAX_PCT],
    tier1_close_pct: Math.round(RULES.TIER1_CLOSE_PCT * 100),
    leverage: effectiveLev,
    position_size_pct: posPct,
    funding_pct_per_hr: f4.pct,
    macro_summary: `F&G ${macro.fear_greed ?? '?'} (${macro.fear_greed_label || ''})`,
    thesis_alignment: String(macro.thesis_status || 'neutral'),
    downgraded,
    downgrade_reason: downgradeReason,
    hard_stops_triggered: hardStops,
  };

  console.log(JSON.stringify(result, null, 2));

  await mergeDashboardScoring({
    last_score: result.score,
    last_grade: result.grade,
    last_ev: result.ev,
    last_scored_at: result.scored_at,
    last_direction: direction,
  });

  if (!generateProposal) {
    console.log('[scoring] No proposal (gates / EV / score)');
    return;
  }

  const meta = await readLastProposalMeta();
  if (meta.at) {
    const hours = (Date.now() - Date.parse(meta.at)) / 3600000;
    if (hours < RULES.PROPOSAL_DEDUP_HOURS && meta.dir === direction) {
      console.log('[scoring] Dedup: proposal in last', RULES.PROPOSAL_DEDUP_HOURS, 'h same direction');
      return;
    }
  }

  const sent = await sendProposalCard(result);
  if (sent) {
    await writeLastProposalMeta(direction);
    await mergeDashboardScoring({
      last_proposal_sent: true,
    });
  }
}

const isMain =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((e) => {
    console.error('[scoring] failed:', e);
    process.exit(1);
  });
}
