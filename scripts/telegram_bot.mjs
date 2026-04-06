#!/usr/bin/env node
/**
 * Session 5 — Telegram proposal cards + optional --daemon (getUpdates polling, callback_query).
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (+ KV vars for daemon persistence)
 */
import https from 'https';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { kvGetJson, kvPutJson, kvEnvOk } from './kv_cloudflare.mjs';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function tgPost(method, body) {
  const data = JSON.stringify(body);
  return new Promise((resolvePromise, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${TOKEN}/${method}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(d);
            if (!j.ok) reject(new Error(j.description || d.slice(0, 200)));
            else resolvePromise(j.result);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/** @param {Record<string, unknown>} result — scoring_engine output */
export async function sendProposalCard(result) {
  if (!TOKEN || !CHAT_ID) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing — skip send');
    return false;
  }

  const dir = String(result.direction || 'long').toUpperCase();
  const grade = result.grade ?? '?';
  const score = result.score ?? '?';
  const ev = result.ev != null ? `${Number(result.ev) >= 0 ? '+' : ''}${Number(result.ev).toFixed(2)}%` : '?';
  const entry = result.entry != null ? `$${Number(result.entry).toLocaleString('en-US')}` : '?';
  const stop = result.stop != null ? `$${Number(result.stop).toLocaleString('en-US')}` : '?';
  const stopPct = result.stop_pct != null ? `${Number(result.stop_pct).toFixed(2)}%` : '?';
  const t1 = result.target_1 != null ? `$${Number(result.target_1).toLocaleString('en-US')}` : '?';
  const t1Pct = result.target_pct != null ? `${Number(result.target_pct).toFixed(2)}%` : '?';
  const lev = result.leverage ?? '?';
  const posPct = result.position_size_pct ?? '?';
  const fr =
    result.funding_pct_per_hr != null ? Number(result.funding_pct_per_hr).toFixed(4) : '?';

  const f = result.factors || {};
  const lines = [
    `TRADE PROPOSAL — BTCUSD ${dir}`,
    `Grade: ${grade}`,
    `Score: ${score}/100`,
    `EV: ${ev}`,
    `Entry: ${entry}`,
    `Stop: ${stop} (${stopPct} loss)`,
    `Target 1: ${t1} (${t1Pct} gain)`,
    `Tier 1 plan: ${Array.isArray(result.tier1_target_pct_band) ? `${result.tier1_target_pct_band[0]}–${result.tier1_target_pct_band[1]}%` : '30–35%'} gain band — close ${result.tier1_close_pct ?? 50}% at T1 (paper)`,
    `Target 2: Trailing from T1`,
    `Leverage: ${lev}x (paper)`,
    `Position size: ${posPct}% of bankroll`,
    `Funding rate: ${fr}/hr`,
    '',
    'Conviction breakdown:',
    `  Trend alignment:   ${f.trend_alignment?.score ?? '?'}/${f.trend_alignment?.max ?? 25}`,
    `  Signal confluence: ${f.signal_confluence?.score ?? '?'}/${f.signal_confluence?.max ?? 25}`,
    `  Risk/reward:       ${f.risk_reward?.score ?? '?'}/${f.risk_reward?.max ?? 20}`,
    `  Funding rate:      ${f.funding_rate?.score ?? '?'}/${f.funding_rate?.max ?? 15}`,
    `  Macro/thesis:      ${f.macro_thesis?.score ?? '?'}/${f.macro_thesis?.max ?? 15}`,
    '',
    `Macro: ${result.macro_summary || '—'}`,
    `Thesis: ${result.thesis_alignment || '—'}`,
    '',
    '⚠️ PAPER TRADE — no real money',
  ];

  const ts = Date.now();
  const text = lines.join('\n');
  await tgPost('sendMessage', {
    chat_id: CHAT_ID,
    text,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ APPROVE', callback_data: `approve_${ts}` },
          { text: '❌ DENY', callback_data: `deny_${ts}` },
        ],
      ],
    },
  });
  return true;
}

async function appendProposalLog(entry) {
  if (!kvEnvOk()) return;
  const prev = (await kvGetJson('scoring:proposals')) || [];
  const list = Array.isArray(prev) ? prev : [];
  list.push({ ...entry, logged_at: new Date().toISOString() });
  const trimmed = list.slice(-200);
  await kvPutJson('scoring:proposals', trimmed);
}

async function handleCallback(data) {
  if (!data || typeof data !== 'string') return;
  const approve = data.startsWith('approve_');
  const deny = data.startsWith('deny_');
  if (!approve && !deny) return;
  const ts = data.replace(/^approve_|^deny_/, '');
  const status = approve ? 'approved' : 'denied';
  console.log(`[telegram] callback ${status} ts=${ts}`);
  await appendProposalLog({ status, callback_ts: ts });
}

async function getUpdatesLongPoll(nextOffset) {
  const body = { timeout: 45, allowed_updates: ['callback_query'] };
  if (nextOffset > 0) body.offset = nextOffset;
  return tgPost('getUpdates', body);
}

async function runDaemon() {
  if (!TOKEN) {
    console.error('[telegram] daemon: TELEGRAM_BOT_TOKEN missing');
    process.exit(1);
  }
  console.log('[telegram] daemon polling (getUpdates POST)...');
  let offset = 0;
  for (;;) {
    try {
      const updates = (await getUpdatesLongPoll(offset)) || [];
      for (const u of updates) {
        offset = u.update_id + 1;
        const cq = u.callback_query;
        if (cq?.data) {
          await handleCallback(cq.data);
          try {
            await tgPost('answerCallbackQuery', { callback_query_id: cq.id });
          } catch (e) {
            console.warn('[telegram] answerCallbackQuery:', e.message);
          }
        }
      }
    } catch (e) {
      console.error('[telegram] poll error:', e.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

const isMain =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain && process.argv.includes('--daemon')) {
  runDaemon();
}
