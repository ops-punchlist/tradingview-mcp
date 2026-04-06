#!/usr/bin/env node
/**
 * Shared Cloudflare KV GET/PUT for dashboard + scoring scripts.
 * Env: CLOUDFLARE_API_TOKEN, CF_KV_NAMESPACE_ID | KV_NAMESPACE_ID, CLOUDFLARE_ACCOUNT_ID (optional)
 */
import https from 'https';

const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT =
  process.env.CLOUDFLARE_ACCOUNT_ID ||
  process.env.CF_ACCOUNT_ID ||
  '3c26eee30bc4f90d841016e831a3b29f';
const CF_KV_NS = process.env.CF_KV_NAMESPACE_ID || process.env.KV_NAMESPACE_ID;

export function kvEnvOk() {
  return !!(CF_TOKEN && CF_KV_NS);
}

function kvValueUrl(key) {
  const keyEnc = encodeURIComponent(key);
  return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${CF_KV_NS}/values/${keyEnc}`;
}

/** @returns {Promise<string|null>} raw body or null if 404 / empty */
export function kvGetText(key) {
  if (!CF_TOKEN || !CF_KV_NS) return Promise.reject(new Error('Missing CLOUDFLARE_API_TOKEN or KV namespace id'));
  const url = kvValueUrl(key);
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { Authorization: `Bearer ${CF_TOKEN}` } }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          if (res.statusCode === 404 || res.statusCode === 400) return resolve(null);
          if (res.statusCode !== 200) {
            return reject(new Error(`KV GET ${key} HTTP ${res.statusCode}: ${d.slice(0, 200)}`));
          }
          resolve(d || null);
        });
      })
      .on('error', reject);
  });
}

export async function kvGetJson(key) {
  const t = await kvGetText(key);
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export function kvPutText(key, body) {
  if (!CF_TOKEN || !CF_KV_NS) return Promise.reject(new Error('Missing CLOUDFLARE_API_TOKEN or KV namespace id'));
  const url = kvValueUrl(key);
  const buf = Buffer.from(body, 'utf8');
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${CF_TOKEN}`,
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': buf.length,
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          if (!d.trim() && res.statusCode >= 200 && res.statusCode < 300) {
            return resolve({ success: true });
          }
          try {
            const r = JSON.parse(d);
            if (r.success) resolve(r);
            else reject(new Error(JSON.stringify(r.errors || r)));
          } catch {
            if (res.statusCode >= 200 && res.statusCode < 300) resolve({ success: true });
            else reject(new Error(d.slice(0, 500)));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

export function kvPutJson(key, obj) {
  return kvPutText(key, JSON.stringify(obj));
}
