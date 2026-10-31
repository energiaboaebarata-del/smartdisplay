// SmartDisplay — sugestão de rolê do dia, lida do site publicado do Rolê BR (sem alterar nada lá).
// /api/role?uf=RJ  → { cidade, nome, link, dia:[paradas], noite:[paradas] }
// A cidade segue o local de acesso (RJ → Rio, SP → Sampa, MG → Beagá; demais → Rio).
const SITE = "https://rolebr.s2bt.com.br/";
const POR_UF = { RJ: "rio", SP: "sampa", MG: "beaga" };
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function semente(txt) { let h = 2166136261; for (const c of txt) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function sorteia(lista, seed) { return lista.length ? lista[seed % lista.length] : null; }

// abre hoje? (heurística pelo texto de "quando"; sem texto = funciona todo dia)
function abreHoje(x, dow, hojeDM) {
  const q = norm(x.quando);
  if (!q || /todos os dias|diariamente|em cartaz/.test(q)) return true;
  if (q.includes(hojeDM)) return true;
  const d = DIAS[dow];
  if (new RegExp("\\b" + d).test(q)) return true;
  const faixa = q.match(/\b(dom|seg|ter|qua|qui|sex|sab)\s*[-–a]\s*(dom|seg|ter|qua|qui|sex|sab)\b/);
  if (faixa) { const a = DIAS.indexOf(faixa[1]), b = DIAS.indexOf(faixa[2]); return a <= b ? dow >= a && dow <= b : dow >= a || dow <= b; }
  return false;
}

function parada(x, rotulo, cid) {
  return { rotulo, nome: x.n, cat: x.c, bairro: x.b || x.r || "", desc: x.d || "", quando: x.quando || "", preco: x.p || 0,
    mapa: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent((x.local || x.n) + ", " + (x.b || "")),
    link: SITE + "#" + cid };
}

function roteiro(itens, plano, seed, cid) {
  const usados = new Set(); let regiao = null; const out = [];
  plano.forEach((etapa, i) => {
    let cand = itens.filter(x => !usados.has(x.n) && etapa.f(x));
    const mesmaRegiao = regiao ? cand.filter(x => x.r === regiao) : [];
    if (mesmaRegiao.length) cand = mesmaRegiao;
    const x = sorteia(cand, semente(seed + ":" + i));
    if (x) { usados.add(x.n); regiao = regiao || x.r; out.push(parada(x, etapa.rotulo, cid)); }
  });
  return out;
}

export async function onRequest({ request }) {
  const u = new URL(request.url);
  const uf = (u.searchParams.get("uf") || request.cf?.regionCode || "RJ").toUpperCase().slice(0, 2);
  const cid = POR_UF[uf] || "rio";
  const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=900" } });
  try {
    const r = await fetch(SITE, { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!r.ok) throw new Error("Rolê respondeu " + r.status);
    const html = await r.text();
    const m = html.match(/const CITIES=(\{[\s\S]*?\});\n/);
    if (!m) throw new Error("roteiros não encontrados no Rolê");
    const C = JSON.parse(m[1])[cid];
    const agora = new Date(Date.now() - 3 * 3600e3), dow = agora.getUTCDay();
    const hojeDM = agora.getUTCDate() + "/" + (agora.getUTCMonth() + 1);
    const hoje = agora.toISOString().slice(0, 10);
    const itens = C.itens.filter(x => abreHoje(x, dow, hojeDM));
    const tem = (x, rx) => rx.test(norm((x.t || []).join(" ") + " " + x.n + " " + x.d));
    const ar = x => ["praia", "trilha", "passeio", "cachoeira"].includes(x.c) || /mirante|parque|museu/.test(norm((x.t || []).join(" ")));
    const almoco = x => x.c === "comer" && !tem(x, /\bbar\b|drinks|boteco/);
    const tarde = x => x.c === "doce" || tem(x, /cafe|sorvet|doceria|padaria|confeitar/);
    const show = x => ["teatro", "show", "cinema"].includes(x.c);
    const jantar = x => x.c === "comer" && tem(x, /contemporanea|italiana|japonesa|frutos do mar|francesa|portuguesa|steakhouse|vinho/);
    const drinks = x => tem(x, /\bbar\b|drinks|boteco|cervej|chopp/);
    const dia = roteiro(itens, [
      { rotulo: "Manhã", f: ar }, { rotulo: "Almoço", f: almoco }, { rotulo: "Tarde", f: tarde },
    ], hoje + ":dia", cid);
    const noite = roteiro(itens, [
      { rotulo: "Jantar", f: x => jantar(x) || almoco(x) }, { rotulo: "Programa", f: show }, { rotulo: "Drinks", f: drinks },
    ], hoje + ":noite", cid);
    return json({ cidade: C.cidade, nome: C.nome, link: SITE + "#" + cid, dia, noite });
  } catch (e) {
    return json({ erro: String(e.message || e), link: SITE }, 200);
  }
}
