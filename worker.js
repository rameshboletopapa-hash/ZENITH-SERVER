// ============================================================
// ⚡ 𝒁𝑬𝑵𝑰𝑻𝑯 LOGs ⚡
// ============================================================
// Receives POST /probe with { url, total, online, offline }
// Forwards to a specific Telegram forum topic.
//
// Hardcoded credentials:
//   BOT_TOKEN = 8983573990:AAEV46CzNYa4pv3TvRzewQXpzkxRitzqpgg
//   CHAT_ID   = -1004291828596
//   TOPIC_ID  = 3  (from https://t.me/c/4291828596/3)
// ============================================================

const BOT_TOKEN = '8983573990:AAEV46CzNYa4pv3TvRzewQXpzkxRitzqpgg';
const CHAT_ID = '-1004291828596';
const MESSAGE_THREAD_ID = 3;  // Your topic ID

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'zenith-logs',
          note: 'POST { url, total, online, offline } to /probe'
        }),
        { status: 200, headers: { 'content-type': 'application/json', ...corsHeaders() } }
      );
    }

    if (url.pathname !== '/probe') {
      return new Response('Not found', { status: 404, headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Use POST' }),
        { status: 405, headers: { 'content-type': 'application/json', ...corsHeaders() } }
      );
    }

    // Parse body
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const target = (body?.url || '').trim();
    if (!target) return json({ error: 'Missing "url" field' }, 400);

    const total   = body?.total;
    const online  = body?.online;
    const offline = body?.offline;
    const hasStats = (typeof total === 'number' && typeof online === 'number' && typeof offline === 'number');

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    let statsLine = '';
    if (hasStats) {
      statsLine = `> 🩶 **Total:** \`${total}\`  ·  💚 **Online:** \`${online}\`  ·  💔 **Offline:** \`${offline}\``;
    } else {
      statsLine = '> *Device stats not provided.*';
    }

    // Build the message with blockquotes and custom name
    const logText =
`⚡ *𝒁𝑬𝑵𝑰𝑻𝑯 LOGs* ⚡

> 📌 **Target:** \`${target}\`
${statsLine}
> 📅 **Checked:** \`${now}\`

_Channel: #zenith-logs_`;

    // Send to Telegram – with message_thread_id for topic routing
    let tgOk = false;
    let tgError = null;
    try {
      const tgUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
      const tgRes = await fetch(tgUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          message_thread_id: MESSAGE_THREAD_ID,  // 🔥 This routes to your topic
          text: logText,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        })
      });
      const tgBody = await tgRes.json().catch(() => ({}));
      tgOk = !!tgBody.ok;
      if (!tgOk) tgError = tgBody.description || 'telegram api error';
    } catch (e) {
      tgError = String(e.message || e);
    }

    return json({
      ok: true,
      target,
      telegram: { posted: tgOk, error: tgError },
      timestamp: now
    });
  }
};

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400'
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders() }
  });
}
