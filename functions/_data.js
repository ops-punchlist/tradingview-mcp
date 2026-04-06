/**
 * Serves dashboard JSON from KV key dashboard:state
 * Route: GET /_data
 */
export async function onRequestGet(context) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  };
  try {
    const raw = await context.env.TRADING_DASHBOARD.get('dashboard:state');
    if (raw == null) {
      return new Response(JSON.stringify({ success: false, error: 'no_data', hint: 'Run node scripts/dashboard_push.mjs' }), {
        status: 404,
        headers,
      });
    }
    return new Response(raw, { headers });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e.message || e) }), {
      status: 500,
      headers,
    });
  }
}
