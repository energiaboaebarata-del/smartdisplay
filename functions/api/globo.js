// SmartDisplay — atalho para os dados públicos do globo da S2BT (ofertas e contornos do mapa).
// O site da S2BT não deixa outras páginas buscarem esses dados direto; aqui o Cloudflare busca por você.
const PARTES = {
  ofertas: { url: "https://www.s2bt.com.br/publico/vitrine/globo-ofertas", cache: 300 },
  base: { url: "https://www.s2bt.com.br/publico/vitrine/globo-malha/base", cache: 604800 },
  municipios: { url: "https://www.s2bt.com.br/publico/vitrine/globo-malha/municipios", cache: 604800 },
};
export async function onRequest({ request }) {
  const parte = new URL(request.url).searchParams.get("parte");
  const alvo = PARTES[parte];
  if (!alvo) return new Response(JSON.stringify({ erro: "parte desconhecida" }), { status: 404, headers: { "Content-Type": "application/json" } });
  const r = await fetch(alvo.url, { cf: { cacheTtl: alvo.cache, cacheEverything: true }, headers: { "User-Agent": "SmartDisplay/1.0", "Accept": "application/json" } });
  if (!r.ok) return new Response(JSON.stringify({ erro: "S2BT respondeu " + r.status }), { status: 502, headers: { "Content-Type": "application/json" } });
  return new Response(await r.text(), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=" + alvo.cache } });
}
