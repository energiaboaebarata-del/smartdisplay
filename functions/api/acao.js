// SmartDisplay — dados de uma ação (nome, valor de mercado e histórico).
// Histórico: Yahoo Finance (qualquer período, grátis); reserva: brapi.dev (o plano grátis só entrega até 3 meses).
// Nome e valor de mercado: brapi.dev (chave BRAPI_TOKEN guardada no Cloudflare), com reserva na Yahoo.
const YAHOO = { "1mo": "1d", "3mo": "1d", "1y": "1d", "5y": "1wk" };
const BRAPI = { "1mo": "1d", "3mo": "1d", "1y": "1wk", "5y": "1mo" };
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36", "Accept": "application/json" };

async function yahoo(t, range) {
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch("https://" + host + ".finance.yahoo.com/v8/finance/chart/" + t + ".SA?range=" + range + "&interval=" + YAHOO[range],
        { cf: { cacheTtl: 600, cacheEverything: true }, headers: UA });
      if (!r.ok) continue;
      const d = await r.json(), res = d.chart && d.chart.result && d.chart.result[0];
      if (!res) continue;
      const ts = res.timestamp || [], c = ((res.indicators.quote || [])[0] || {}).close || [];
      const historico = ts.map((x, i) => ({ t: x, v: c[i] })).filter(p => p.v != null);
      const m = res.meta || {};
      const anterior = m.previousClose ?? m.chartPreviousClose;
      return { historico, nome: m.longName || m.shortName, preco: m.regularMarketPrice,
        variacao: m.regularMarketPrice != null && anterior && range !== "5y" && m.previousClose ? (m.regularMarketPrice / m.previousClose - 1) * 100 : null };
    } catch (e) {}
  }
  return null;
}

async function brapi(t, range, token) {
  if (!token) return null;
  try {
    const q = range ? "?range=" + range + "&interval=" + BRAPI[range] + "&token=" : "?token=";
    const r = await fetch("https://brapi.dev/api/quote/" + t + q + encodeURIComponent(token), { cf: { cacheTtl: 600, cacheEverything: true } });
    const d = await r.json().catch(() => null);
    return r.ok && d && d.results && d.results[0] ? d.results[0] : null;
  } catch (e) { return null; }
}

export async function onRequest({ request, env }) {
  const u = new URL(request.url);
  const t = (u.searchParams.get("t") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const range = YAHOO[u.searchParams.get("range")] ? u.searchParams.get("range") : "3mo";
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=600" } });
  if (!/^[A-Z]{4}\d{1,2}$/.test(t)) return json({ erro: "código inválido" }, 400);

  const [y, b] = await Promise.all([yahoo(t, range), brapi(t, null, env.BRAPI_TOKEN)]);
  let historico = y && y.historico.length ? y.historico : null, fonte = "Yahoo Finance";
  if (!historico) {                       // reserva: histórico pela brapi (até 3 meses no plano grátis)
    const bh = await brapi(t, range, env.BRAPI_TOKEN);
    historico = bh ? (bh.historicalDataPrice || []).filter(p => p.close != null).map(p => ({ t: p.date, v: p.close })) : [];
    fonte = "brapi.dev";
  }
  if (!b && !y) return json({ erro: "cotação indisponível agora (Yahoo e brapi não responderam)" }, 502);
  return json({
    codigo: (b && b.symbol) || t,
    nome: (b && (b.longName || b.shortName)) || (y && y.nome) || t,
    logo: (b && b.logourl) || "",
    preco: b ? b.regularMarketPrice : y.preco,
    variacao: b ? b.regularMarketChangePercent : y.variacao,
    valorMercado: b ? b.marketCap : null,
    historico, fonte,
  });
}
