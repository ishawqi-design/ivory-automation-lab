// جسر كلود لمختبر ايفوري — يعمل فقط إذا أُضيف متغير ANTHROPIC_API_KEY في إعدادات مشروع Cloudflare
const hits = new Map();
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname !== '/api/claude') {
      const res = await env.ASSETS.fetch(req);
      // منع الكاش على index.html حتى يرى المتصفح كل إصدار جديد فوراً
      if (u.pathname === '/' || u.pathname === '/index.html') {
        const headers = new Headers(res.headers);
        headers.set('cache-control', 'no-cache, no-store, must-revalidate');
        headers.set('pragma', 'no-cache');
        return new Response(res.body, { status: res.status, headers });
      }
      return res;
    }
    if (req.method === 'GET') return json({ ok: !!env.ANTHROPIC_API_KEY });
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'not_configured' }, 503);
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== u.host) return json({ error: 'origin' }, 403);
    const ip = req.headers.get('cf-connecting-ip') || 'x', now = Date.now();
    const h = (hits.get(ip) || []).filter(t => now - t < 60000); h.push(now); hits.set(ip, h);
    if (h.length > (+env.RATE_PER_MIN || 20)) return json({ error: 'rate_limited' }, 429);
    let body; try { body = await req.json(); } catch (e) { return json({ error: 'bad_json' }, 400); }
    const prompt = String(body.prompt || '');
    if (!prompt || prompt.length > 60000) return json({ error: 'bad_prompt' }, 400);
    const model = env.MODEL || 'claude-sonnet-5-5';
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 6000, messages: [{ role: 'user', content: prompt }] }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: (j.error && j.error.type) || 'upstream' }, r.status === 429 ? 429 : 502);
    return json({ text: (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('') });
  }
};
