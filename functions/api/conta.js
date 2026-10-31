// SmartDisplay — contador de visitas dos projetos (1 por aparelho por dia; o site chama este endereço).
// Guarda no Cloudflare KV "ALERTAS", chave "fluxo:<site>", os últimos 400 dias.
export const SITES = ["poderometro", "inclui", "agape", "prumo", "bola", "tatame", "role", "s2bt"];
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const s = new URL(request.url).searchParams.get("s");
  if (!SITES.includes(s) || !env.ALERTAS) return new Response(null, { status: 204, headers: CORS });
  const dia = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  try {
    const chave = "fluxo:" + s, d = JSON.parse((await env.ALERTAS.get(chave)) || "{}");
    d[dia] = (d[dia] || 0) + 1;
    const dias = Object.keys(d).sort(); while (dias.length > 400) delete d[dias.shift()];
    await env.ALERTAS.put(chave, JSON.stringify(d));
  } catch (e) { /* limite do armazenamento: ignora sem quebrar o site */ }
  return new Response(null, { status: 204, headers: CORS });
}
