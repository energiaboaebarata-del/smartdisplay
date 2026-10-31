// SmartDisplay — dados de uma ação (nome, valor de mercado e histórico) pela brapi.dev.
// A chave da brapi fica guardada no Cloudflare (BRAPI_TOKEN), nunca na página.
const PERIODOS = { "1mo": "1d", "3mo": "1d", "1y": "1wk", "5y": "1mo" };
export async function onRequest({ request, env }) {
  const u = new URL(request.url);
  const t = (u.searchParams.get("t") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const range = PERIODOS[u.searchParams.get("range")] ? u.searchParams.get("range") : "3mo";
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=600" } });
  if (!/^[A-Z]{4}\d{1,2}$/.test(t)) return json({ erro: "código inválido" }, 400);
  if (!env.BRAPI_TOKEN) return json({ erro: "falta a chave da brapi (BRAPI_TOKEN) no Cloudflare" }, 503);
  const url = "https://brapi.dev/api/quote/" + t + "?range=" + range + "&interval=" + PERIODOS[range] + "&token=" + encodeURIComponent(env.BRAPI_TOKEN);
  const r = await fetch(url, { cf: { cacheTtl: 600, cacheEverything: true } }).catch(() => null);
  if (!r) return json({ erro: "brapi não respondeu" }, 502);
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || !d.results || !d.results[0]) return json({ erro: (d && d.message) || ("brapi respondeu " + r.status) }, r.ok ? 502 : r.status);
  const a = d.results[0];
  return json({
    codigo: a.symbol, nome: a.longName || a.shortName || a.symbol, logo: a.logourl || "",
    preco: a.regularMarketPrice, variacao: a.regularMarketChangePercent, valorMercado: a.marketCap,
    historico: (a.historicalDataPrice || []).filter(p => p.close != null).map(p => ({ t: p.date, v: p.close })),
  });
}
