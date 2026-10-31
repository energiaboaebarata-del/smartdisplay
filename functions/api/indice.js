// SmartDisplay — índices de bolsa (Ibovespa, S&P 500, Nasdaq) pela Yahoo Finance; Ibovespa também pela brapi, se a Yahoo falhar.
const INDICES = { "^BVSP": "Ibovespa", "^GSPC": "S&P 500", "^IXIC": "Nasdaq" };
const RANGES = { "5d": "1d", "1mo": "1d", "3mo": "1d", "1y": "1d", "5y": "1wk" };
export async function onRequest({ request, env }) {
  const u = new URL(request.url);
  const s = u.searchParams.get("s"), range = RANGES[u.searchParams.get("range")] ? u.searchParams.get("range") : "1y";
  const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  if (!INDICES[s]) return json({ erro: "índice desconhecido" }, 400);
  const erros = [];
  // 1) Yahoo Finance
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch("https://" + host + ".finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(s) + "?range=" + range + "&interval=" + RANGES[range],
        { cf: { cacheTtl: 300, cacheEverything: true }, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36", "Accept": "application/json" } });
      if (!r.ok) { erros.push("Yahoo " + r.status); continue; }
      const d = await r.json(), res = d.chart && d.chart.result && d.chart.result[0];
      if (!res) { erros.push("Yahoo sem dados"); continue; }
      const t = res.timestamp || [], c = (res.indicators.quote[0] || {}).close || [];
      const hist = t.map((x, i) => ({ t: x, v: c[i] })).filter(p => p.v != null);
      const m = res.meta || {}, preco = m.regularMarketPrice ?? (hist.length ? hist[hist.length - 1].v : null);
      const anterior = m.chartPreviousClose ?? m.previousClose;
      return json({ nome: INDICES[s], preco, variacao: preco != null && anterior ? (preco / anterior - 1) * 100 : null, historico: hist, fonte: "Yahoo Finance" });
    } catch (e) { erros.push("Yahoo falhou"); }
  }
  // 2) Ibovespa pela brapi (precisa da chave BRAPI_TOKEN)
  if (s === "^BVSP" && env.BRAPI_TOKEN) {
    try {
      const r = await fetch("https://brapi.dev/api/quote/%5EBVSP?range=" + range + "&interval=" + RANGES[range] + "&token=" + encodeURIComponent(env.BRAPI_TOKEN));
      const d = await r.json(), a = d.results && d.results[0];
      if (a) return json({ nome: "Ibovespa", preco: a.regularMarketPrice, variacao: a.regularMarketChangePercent,
        historico: (a.historicalDataPrice || []).filter(p => p.close != null).map(p => ({ t: p.date, v: p.close })), fonte: "brapi.dev" });
      erros.push("brapi sem dados");
    } catch (e) { erros.push("brapi falhou"); }
  }
  return json({ erro: erros.join(" | ") || "sem dados" }, 502);
}
