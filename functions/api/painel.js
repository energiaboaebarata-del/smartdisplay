// SmartDisplay — motor que busca os dados dos sites do Rafael (roda no Cloudflare, não no navegador).
// Endereço: /api/painel   (agenda só com a chave certa: /api/painel?k=SUA_CHAVE)

const PODEROMETRO = "https://poderometro.com.br/data/votacoes.json";
const INCLUI = "https://pcd.s2bt.com.br/";
const S2BT_UF = "https://www.s2bt.com.br/publico/vitrine/uf/";

async function pegar(url, tipo) {
  const r = await fetch(url, { cf: { cacheTtl: 900, cacheEverything: true }, headers: { "User-Agent": "SmartDisplay/1.0" } });
  if (!r.ok) throw new Error(url + " " + r.status);
  return tipo === "texto" ? r.text() : r.json();
}

// ---------- Política (Poderômetro) ----------
async function politica() {
  const d = await pegar(PODEROMETRO);
  const itens = [];
  (d.stf || []).slice(0, 3).forEach(n => itens.push({ titulo: n.titulo, fonte: "STF", data: n.dataHora, url: n.link }));
  const vistas = new Set();
  const unica = v => v.materia && !vistas.has(v.materia) && vistas.add(v.materia);
  (d.camara || []).filter(unica).slice(0, 1).forEach(v => itens.push({
    titulo: v.materia + ": " + (v.ementa || v.descricao || "").slice(0, 90) + ((v.ementa || "").length > 90 ? "…" : ""),
    fonte: "Câmara · " + (v.aprovada ? "aprovado" : "votação"), data: v.dataHora, url: v.url }));
  (d.senado || []).filter(unica).slice(0, 1).forEach(v => itens.push({
    titulo: v.materia + ": " + (v.ementa || "").slice(0, 90) + ((v.ementa || "").length > 90 ? "…" : ""),
    fonte: "Senado · " + (v.resultado || "votação"), data: v.dataHora, url: v.url }));
  itens.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  return { atualizado: d.atualizadoEm, itens: itens.slice(0, 5) };
}

// ---------- Direitos PcD (Inclui+) ----------
async function pcd() {
  const html = await pegar(INCLUI, "texto");
  const m = html.match(/<script type="application\/json" id="noticias">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("notícias não encontradas no Inclui+");
  const d = JSON.parse(m[1]);
  const itens = (d.itens || []).slice().sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 4)
    .map(n => ({ titulo: n.titulo, fonte: n.fonte, data: n.data, url: n.url }));
  return { atualizado: d.atualizado, itens };
}

// ---------- Melhor oferta (S2BT), pelo estado de onde você está ----------
async function oferta(uf) {
  const d = await pegar(S2BT_UF + encodeURIComponent(uf));
  const dists = (d.distribuidoras || []).map(g => {
    const melhor = (g.opcoes || [])[0];
    return melhor ? { distribuidora: g.distribuidora, texto: melhor.headline.texto, maximo: melhor.headline.maximo,
      explicacao: melhor.headline.explicacao, opcoes: g.opcoes.length } : null;
  }).filter(Boolean).sort((a, b) => (b.maximo || 0) - (a.maximo || 0));
  return { uf, distribuidoras: dists.slice(0, 3) };
}

// ---------- Agenda de hoje (Google Agenda, endereço secreto iCal) ----------
const DIA_SP = () => { const d = new Date(Date.now() - 3 * 3600e3); return d.toISOString().slice(0, 10).replace(/-/g, ""); };
function linhasICS(txt) { return txt.replace(/\r?\n[ \t]/g, "").split(/\r?\n/); }
function paraSP(valor, params) {
  // devolve {dia:"AAAAMMDD", hora:"HH:MM" ou null}
  if (/VALUE=DATE/.test(params) || /^\d{8}$/.test(valor)) return { dia: valor.slice(0, 8), hora: null };
  const m = valor.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (!m) return null;
  let dt;
  if (valor.endsWith("Z")) dt = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) - 3 * 3600e3);
  else dt = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5])); // já no horário local
  const iso = dt.toISOString();
  return { dia: iso.slice(0, 10).replace(/-/g, ""), hora: iso.slice(11, 16) };
}
function diaSemana(aaaammdd) { return new Date(Date.UTC(+aaaammdd.slice(0, 4), aaaammdd.slice(4, 6) - 1, +aaaammdd.slice(6, 8))).getUTCDay(); }
const SIGLAS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
function ocorreHoje(ev, hoje) {
  if (!ev.inicio) return false;
  if (ev.excecoes.includes(hoje)) return false;
  if (!ev.rrule) return ev.inicio.dia === hoje;
  if (ev.inicio.dia > hoje) return false;
  const r = Object.fromEntries(ev.rrule.split(";").map(p => p.split("=")));
  if (r.UNTIL && r.UNTIL.slice(0, 8) < hoje) return false;
  const passo = +(r.INTERVAL || 1);
  const dias = Math.round((Date.UTC(+hoje.slice(0, 4), hoje.slice(4, 6) - 1, +hoje.slice(6, 8)) -
    Date.UTC(+ev.inicio.dia.slice(0, 4), ev.inicio.dia.slice(4, 6) - 1, +ev.inicio.dia.slice(6, 8))) / 864e5);
  if (r.FREQ === "DAILY") return dias % passo === 0;
  if (r.FREQ === "WEEKLY") {
    const alvo = r.BYDAY ? r.BYDAY.split(",") : [SIGLAS[diaSemana(ev.inicio.dia)]];
    return alvo.includes(SIGLAS[diaSemana(hoje)]) && Math.floor(dias / 7) % passo === 0;
  }
  if (r.FREQ === "MONTHLY" && !r.BYDAY) return hoje.slice(6, 8) === ev.inicio.dia.slice(6, 8);
  if (r.FREQ === "YEARLY") return hoje.slice(4, 8) === ev.inicio.dia.slice(4, 8);
  return false;
}
async function agenda(urlICS) {
  const txt = await pegar(urlICS, "texto");
  const hoje = DIA_SP();
  const eventos = []; let ev = null; const cancelados = new Set();
  for (const l of linhasICS(txt)) {
    if (l === "BEGIN:VEVENT") { ev = { excecoes: [] }; continue; }
    if (l === "END:VEVENT") { if (ev) eventos.push(ev); ev = null; continue; }
    if (!ev) continue;
    const i = l.indexOf(":"); if (i < 0) continue;
    const chave = l.slice(0, i), valor = l.slice(i + 1), nome = chave.split(";")[0];
    if (nome === "DTSTART") ev.inicio = paraSP(valor, chave);
    else if (nome === "SUMMARY") ev.titulo = valor.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, " ");
    else if (nome === "RRULE") ev.rrule = valor;
    else if (nome === "EXDATE") valor.split(",").forEach(v => { const p = paraSP(v, chave); if (p) ev.excecoes.push(p.dia); });
    else if (nome === "RECURRENCE-ID") ev.recorrencia = paraSP(valor, chave);
    else if (nome === "UID") ev.uid = valor;
    else if (nome === "STATUS") ev.status = valor;
  }
  // ocorrências remarcadas: a versão editada substitui a original naquele dia
  eventos.filter(e => e.recorrencia).forEach(e => cancelados.add(e.uid + "|" + e.recorrencia.dia));
  const doDia = eventos.filter(e => e.status !== "CANCELLED")
    .filter(e => e.recorrencia ? e.inicio && e.inicio.dia === hoje : ocorreHoje(e, hoje) && !cancelados.has(e.uid + "|" + hoje))
    .map(e => ({ hora: e.inicio.hora, titulo: e.titulo || "(sem título)" }))
    .sort((a, b) => (a.hora || "00:00").localeCompare(b.hora || "00:00"));
  return { itens: doDia.slice(0, 8), total: doDia.length };
}

// ---------- Mercado futuro (B3, com ~15 min de atraso) ----------
const B3 = "https://cotacao.b3.com.br/mds/api/v1/DerivativeQuotation/";
const num = v => (v == null || v === "" || isNaN(Number(v))) ? null : Number(v);
async function contratos(ativo) {
  const opcoes = {
    cf: { cacheTtl: 300, cacheEverything: true },
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*", "Referer": "https://www.b3.com.br/" },
  };
  // 526 = o Cloudflare não aceitou o certificado da B3; tenta pelo endereço sem https
  let r = await fetch(B3 + ativo, opcoes).catch(() => null);
  if (!r || !r.ok) { const r2 = await fetch(B3.replace("https://", "http://") + ativo, opcoes).catch(() => null); if (r2 && r2.ok) r = r2; }
  if (!r || !r.ok) throw new Error(ativo + ": B3 respondeu " + (r ? r.status : "sem resposta"));
  const txt = await r.text();
  let d; try { d = JSON.parse(txt); } catch (e) { throw new Error(ativo + ": resposta não é JSON (" + txt.slice(0, 60) + ")"); }
  const lista = (d.Scty || []).map(s => {
    const q = s.SctyQtn || {};
    const compra = num(s.buyOffer && s.buyOffer.price), venda = num(s.sellOffer && s.sellOffer.price);
    return {
      codigo: s.symb,
      vencimento: s.asset && s.asset.AsstSummry && s.asset.AsstSummry.mtrtyCode,
      atual: num(q.curPrc),
      meio: compra != null && venda != null ? (compra + venda) / 2 : (compra != null ? compra : venda),
      ajuste: num(q.prvsDayAdjstmntPric),
      variacao: num(q.prcFlcn),
    };
  }).filter(c => c.vencimento).sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
  if (!lista.length) throw new Error(ativo + ": B3 não mandou contratos");
  return lista;
}
const MESES = { F: "jan", G: "fev", H: "mar", J: "abr", K: "mai", M: "jun", N: "jul", Q: "ago", U: "set", V: "out", X: "nov", Z: "dez" };
const rotulo = codigo => { const m = String(codigo).match(/([FGHJKMNQUVXZ])(\d{2})$/); return m ? MESES[m[1]] + "/" + m[2] : codigo; };
// moeda (DOL/EUR): preço em pontos por US$/€ 1.000; DI: a própria taxa (%)
function cotacao(c, moeda) {
  let valor = c.atual, base = "agora";
  if (valor == null && c.meio != null) { valor = c.meio; base = "ofertas"; }
  if (valor == null && moeda && c.ajuste != null) { valor = c.ajuste; base = "ajuste de ontem"; }
  if (valor == null) return null;
  let variacao = c.variacao;
  if (variacao == null && moeda && c.ajuste && base !== "ajuste de ontem") variacao = (valor / c.ajuste - 1) * 100;
  return { codigo: rotulo(c.codigo), valor: moeda ? valor / 1000 : valor, variacao, base };
}
async function futuros() {
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const futuras = lista => lista.filter(c => c.vencimento > hoje);
  const primeiraComPreco = (lista, moeda) => { for (const c of futuras(lista)) { const q = cotacao(c, moeda); if (q) return q; } return null; };
  const [dol, eur, di] = await Promise.allSettled([contratos("DOL"), contratos("EUR"), contratos("DI1")]);
  const saida = {}, erros = [];
  if (dol.status === "fulfilled") { const q = primeiraComPreco(dol.value, true); if (q) saida.dolar = q; else erros.push("DOL: sem preço"); } else erros.push(String(dol.reason.message));
  if (eur.status === "fulfilled") { const q = primeiraComPreco(eur.value, true); if (q) saida.euro = q; else erros.push("EUR: sem preço"); } else erros.push(String(eur.reason.message));
  if (di.status === "fulfilled") {
    // o mais acompanhado: o DI de janeiro do ano que vem
    const ano = String(new Date(Date.now() - 3 * 3600e3).getUTCFullYear() + 1).slice(2);
    const alvo = di.value.find(x => x.codigo === "DI1F" + ano);
    const q = (alvo && cotacao(alvo, false)) || primeiraComPreco(di.value, false);
    if (q) saida.juros = q; else erros.push("DI1: sem preço");
  } else erros.push(String(di.reason.message));
  if (erros.length) saida.avisos = erros;
  if (!saida.dolar && !saida.euro && !saida.juros) throw new Error(erros.join(" | ") || "B3 sem dados");
  return saida;
}

// ---------- Junta tudo ----------
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const uf = (url.searchParams.get("uf") || request.cf?.regionCode || "RJ").toUpperCase().slice(0, 2);
  const tarefas = { politica: politica(), pcd: pcd(), futuros: futuros() };
  const chave = url.searchParams.get("k");
  const agendaLiberada = env.SD_CHAVE && env.AGENDA_ICS && chave && chave === env.SD_CHAVE;
  if (agendaLiberada) tarefas.agenda = agenda(env.AGENDA_ICS);
  const nomes = Object.keys(tarefas);
  const res = await Promise.allSettled(Object.values(tarefas));
  const saida = { geradoEm: new Date().toISOString(), local: { cidade: request.cf?.city || "", uf } };
  res.forEach((r, i) => { saida[nomes[i]] = r.status === "fulfilled" ? r.value : { erro: String(r.reason && r.reason.message || r.reason) }; });
  if (!agendaLiberada) saida.agenda = { bloqueada: true, configurada: Boolean(env.SD_CHAVE && env.AGENDA_ICS) };
  return new Response(JSON.stringify(saida), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
}
