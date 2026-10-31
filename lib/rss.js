// Leitura de RSS (Google Notícias com reserva no Bing Notícias) — usado por /api/painel e /api/noticias

async function baixa(url) {
  const r = await fetch(url, { cf: { cacheTtl: 900, cacheEverything: true }, headers: { "User-Agent": "Mozilla/5.0 (SmartDisplay)", "Accept-Language": "pt-BR,pt;q=0.9" } });
  if (!r.ok) throw new Error(new URL(url).hostname + " " + r.status);
  return r.text();
}

export function limpa(s) {
  return String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).trim();
}

export function rssItens(xml) {
  const tag = (bloco, nome) => { const m = bloco.match(new RegExp("<" + nome + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + nome + ">", "i")); return m ? limpa(m[1]) : ""; };
  return (xml.match(/<item[\s>][\s\S]*?<\/item>/g) || []).map(b => ({ b, titulo: tag(b, "title"), url: tag(b, "link"), data: tag(b, "pubDate"),
    fonte: tag(b, "source") || tag(b, "News:Source") }));
}

export function isoData(d) { const t = Date.parse(d); return isNaN(t) ? "" : new Date(t - 3 * 3600e3).toISOString().slice(0, 16); }

function linkReal(u) {
  try { const x = new URL(u); if (/bing\.com$/.test(x.hostname) && x.searchParams.get("url")) return x.searchParams.get("url"); } catch (e) {}
  return u;
}

export async function noticiasBusca(q, n) {
  const fontes = [
    "https://news.google.com/rss/search?hl=pt-BR&gl=BR&ceid=BR:pt-419&q=" + encodeURIComponent(q + " when:3d"),
    "https://www.bing.com/news/search?format=rss&setlang=pt-BR&cc=BR&mkt=pt-BR&qft=sortbydate%3d%221%22&q=" + encodeURIComponent(q),
  ];
  const erros = [];
  for (const u of fontes) {
    try {
      const itens = rssItens(await baixa(u));
      if (!itens.length) throw new Error(new URL(u).hostname + " sem itens");
      const vistos = new Set();
      const lista = itens.map(i => {
        let titulo = i.titulo, fonte = i.fonte;
        const m = titulo.match(/^(.*) - ([^-]{2,40})$/);
        if (m) { titulo = m[1]; fonte = fonte || m[2]; }
        const url = linkReal(i.url);
        if (!fonte) { try { fonte = new URL(url).hostname.replace(/^www\./, ""); } catch (e) {} }
        return { titulo, fonte, data: isoData(i.data), url };
      }).filter(i => { const k = i.titulo.toLowerCase().slice(0, 50); if (!i.titulo || vistos.has(k)) return false; vistos.add(k); return true; })
        .sort((a, b) => b.data.localeCompare(a.data));
      return { itens: lista.slice(0, n) };
    } catch (e) { erros.push(String(e.message || e)); }
  }
  throw new Error(erros.join(" · "));
}
