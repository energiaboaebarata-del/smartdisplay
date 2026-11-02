// SmartDisplay — Post do dia, lido do módulo Marketing da plataforma S2BT (só leitura; só com a chave pessoal).
// GET /api/post?k=CHAVE              → { hoje, agora, itens }
// GET /api/post?k=CHAVE&arquivo=ID   → a arte/vídeo do post (passa pela Cloudflare; a senha nunca vai ao navegador)
const BASE = "https://www.s2bt.com.br";

export async function onRequest({ request, env }) {
  const u = new URL(request.url);
  const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  if (!env.SD_CHAVE || u.searchParams.get("k") !== env.SD_CHAVE) return json({ erro: "abra pelo seu link pessoal" }, 401);
  const token = String(env.MKT_TOKEN || "").trim();
  if (!token) return json({ erro: "falta a senha MKT_TOKEN na Cloudflare" }, 503);
  const auth = { Authorization: "Bearer " + token };
  const arq = u.searchParams.get("arquivo");
  if (arq) {
    if (!/^\d{1,9}$/.test(arq)) return json({ erro: "arquivo inválido" }, 400);
    const r = await fetch(BASE + "/publico/mkt/arquivos/" + arq, { headers: { ...auth, Range: request.headers.get("Range") || "" } });
    const h = new Headers();
    for (const k of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Last-Modified", "ETag"]) if (r.headers.get(k)) h.set(k, r.headers.get(k));
    h.set("Cache-Control", "private, max-age=3600"); h.set("X-Content-Type-Options", "nosniff");
    return new Response(r.body, { status: r.status, headers: h });
  }
  try {
    const r = await fetch(BASE + "/publico/mkt/hoje", { headers: auth });
    const d = await r.json().catch(() => ({ erro: "resposta inválida" }));
    if (!r.ok) return json({ erro: "Plataforma S2BT respondeu " + r.status + (d.erro ? " (" + d.erro + ")" : "") });
    return json(d);
  } catch (e) { return json({ erro: "Plataforma S2BT fora do ar: " + (e.message || e) }); }
}
