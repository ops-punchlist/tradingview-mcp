#!/usr/bin/env node
/**
 * Session 4 — CoinGecko + F&G + TradingView (tv CLI) + Kraken → Cloudflare KV dashboard:state
 *
 * Env (required for KV): CLOUDFLARE_API_TOKEN, CF_KV_NAMESPACE_ID or KV_NAMESPACE_ID
 * Env (optional): CLOUDFLARE_ACCOUNT_ID, KRAKEN_API_KEY, KRAKEN_API_SECRET, KRAKEN_CLI, TV_SWITCH_DELAY_MS, SKIP_TV=1
 */

import https from 'https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const TV_CLI = join(ROOT, 'src/cli/index.js');
const DELAY_MS = Number(process.env.TV_SWITCH_DELAY_MS || 1200);
const KRAKEN = process.env.KRAKEN_CLI || join(process.env.HOME || '', '.cargo/bin/kraken');
const SKIP_TV = process.env.SKIP_TV === '1' || process.env.SKIP_TV === 'true';

const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT =
  process.env.CLOUDFLARE_ACCOUNT_ID ||
  process.env.CF_ACCOUNT_ID ||
  '3c26eee30bc4f90d841016e831a3b29f';
const CF_KV_NS = process.env.CF_KV_NAMESPACE_ID || process.env.KV_NAMESPACE_ID;

if (!CF_TOKEN || !CF_KV_NS) {
  console.error('Missing env vars:', { CF_TOKEN: !!CF_TOKEN, CF_KV_NS: !!CF_KV_NS });
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'btc-dashboard/1.0' } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function tv(args) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [TV_CLI, ...args], {
      cwd: ROOT,
      maxBuffer: 50 * 1024 * 1024,
    });
    const t = stdout.trim();
    if (!t) return { success: false, error: 'empty_stdout', args };
    return JSON.parse(t);
  } catch (e) {
    return {
      success: false,
      error: e.message,
      stderr: e.stderr?.toString?.()?.slice(0, 800),
      args,
    };
  }
}

async function krakenJson(args) {
  try {
    const { stdout, stderr } = await execFileAsync(KRAKEN, [...args, '-o', 'json'], {
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
    });
    if (stderr?.length) {
      // kraken sometimes logs hints to stderr; ignore if stdout parses
    }
    const t = stdout.trim();
    if (!t) return { success: false, error: 'empty_stdout', kraken_args: args };
    return JSON.parse(t);
  } catch (e) {
    return {
      success: false,
      error: e.message,
      stderr: e.stderr?.toString?.()?.slice(0, 800),
      kraken_args: args,
    };
  }
}

async function readChartBundle(tfMinutes) {
  if (SKIP_TV) {
    return {
      symbol: 'KRAKEN:BTCUSD',
      timeframe: String(tfMinutes),
      ohlcv: null,
      indicators: [],
      levels: [],
      _skipped: true,
    };
  }
  const tf = String(tfMinutes);
  const tfSet = await tv(['timeframe', tf]);
  await sleep(DELAY_MS);
  const [state, quote, values, ohlcv, lines] = await Promise.all([
    tv(['state']),
    tv(['quote']),
    tv(['values']),
    tv(['ohlcv', '--summary']),
    tv(['data', 'lines']),
  ]);
  const sym = state?.symbol || quote?.symbol || 'KRAKEN:BTCUSD';
  return {
    symbol: sym,
    timeframe: tf,
    ohlcv,
    indicators: values,
    levels: lines,
    _timeframe_set: tfSet,
  };
}

async function main() {
  console.log('Starting dashboard push...');

  const fg = await fetchJson('https://api.alternative.me/fng/?limit=1').catch(() => null);
  const btc = await fetchJson(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true'
  ).catch(() => null);

  const chart1h = await readChartBundle(60);
  const chart4h = await readChartBundle(240);

  const futTicker = await krakenJson(['futures', 'ticker', 'PF_XBTUSD']);
  const balances = await krakenJson(['balance']);
  const positions = await krakenJson(['futures', 'positions']);

  const tickerObj = futTicker?.ticker ?? futTicker;
  const fundingCurrent = tickerObj?.fundingRate ?? null;
  const fundingNext = tickerObj?.fundingRatePrediction ?? null;

  let openPositions = [];
  if (positions && !positions.error && positions.success !== false) {
    if (Array.isArray(positions)) openPositions = positions;
    else if (Array.isArray(positions.positions)) openPositions = positions.positions;
    else if (Array.isArray(positions.openPositions)) openPositions = positions.openPositions;
    else if (positions.result && Array.isArray(positions.result)) openPositions = positions.result;
  }

  const payload = {
    updated_at: new Date().toISOString(),
    btc: {
      price: btc?.bitcoin?.usd ?? null,
      change_24h: btc?.bitcoin?.usd_24h_change ?? null,
      vs_200sma: 'unknown',
    },
    macro: {
      fear_greed: fg?.data?.[0]?.value ? parseInt(fg.data[0].value, 10) : null,
      fear_greed_label: fg?.data?.[0]?.value_classification ?? null,
      bond_yield_10yr: null,
      oil_trend: 'unknown',
      thesis_status: 'active',
    },
    chart_1h: chart1h,
    chart_4h: chart4h,
    kraken: {
      futures_ticker: tickerObj && typeof tickerObj === 'object' ? tickerObj : futTicker,
      funding_rate_current: fundingCurrent,
      funding_rate_next: fundingNext,
      open_positions: openPositions,
      balances,
      futures_positions_raw: positions,
    },
    scoring: { last_score: null, last_grade: null, last_ev: null, last_scored_at: null },
    bankroll: {
      starting: 1000,
      current: 1000,
      drawdown_pct: 0,
      sats_accumulated: 0,
      trade_count: 0,
      win_count: 0,
    },
  };

  console.log(`  BTC (CoinGecko): $${payload.btc.price?.toLocaleString() ?? '?'}`);
  console.log(`  F&G: ${payload.macro.fear_greed} — ${payload.macro.fear_greed_label}`);
  if (!SKIP_TV) {
    console.log(`  TV 1H: ${payload.chart_1h.symbol} — ohlcv ok: ${!!payload.chart_1h.ohlcv?.close}`);
    console.log(`  TV 4H: ${payload.chart_4h.symbol} — ohlcv ok: ${!!payload.chart_4h.ohlcv?.close}`);
  } else {
    console.log('  TV: skipped (SKIP_TV=1)');
  }

  const body = JSON.stringify(payload);
  const keyEnc = encodeURIComponent('dashboard:state');
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${CF_KV_NS}/values/${keyEnc}`;

  await new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${CF_TOKEN}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            const r = JSON.parse(d);
            if (r.success) resolve(r);
            else reject(new Error(JSON.stringify(r.errors || r)));
          } catch {
            reject(new Error(d.slice(0, 500)));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  console.log('KV updated: dashboard:state');
  console.log('https://btc-trading-dashboard.pages.dev');
}

main().catch((e) => {
  console.error('Push failed:', e.message);
  process.exit(1);
});
