// SmartDisplay — controle da ração do Joka (dados no Cloudflare KV "ALERTAS", chave "joka"; só com a chave pessoal).
// Conta o que o alimentador solta pela programação (+ doses extras registradas). O que sai do tanque sai do pacote.
const PADRAO = {
  porcaoG: 17.5,                                         // média de 4 pesagens (31/10/2026)
  programacao: [{ h: 7, p: 3 }, { h: 13, p: 1 }, { h: 18, p: 2 }],
  tanqueG: 1000,                                         // modelo pequeno (~23 cm): estimativa, ajustável
  pacoteG: 2500,                                         // N&D raça mini 2,5 kg
  eventos: [{ tipo: "pacote", quando: "2026-10-07T12:00:00-03:00" }, { tipo: "tanque", quando: "2026-10-27T12:00:00-03:00", estimado: true }],
};
const DIA = 864e5;
const sp = t => new Date(t - 3 * 3600e3);              // relógio de Brasília (sem horário de verão)
function porcoesEntre(cfg, ini, fim) {                  // porções programadas soltas entre dois instantes
  let n = 0, porDia = {};
  const d0 = new Date(Date.UTC(sp(ini).getUTCFullYear(), sp(ini).getUTCMonth(), sp(ini).getUTCDate()));
  for (let d = d0.getTime(); d <= fim + DIA; d += DIA) {
    for (const s of cfg.programacao) {
      const t = d + s.h * 3600e3 + 3 * 3600e3;            // hora local → UTC
      if (t > ini && t <= fim) { n += s.p; const k = new Date(d).toISOString().slice(0, 10); porDia[k] = (porDia[k] || 0) + s.p; }
    }
  }
  return { n, porDia };
}
function extrasEntre(cfg, ini, fim) {
  let n = 0, porDia = {};
  for (const e of cfg.eventos) if (e.tipo === "extra") { const t = Date.parse(e.quando); if (t > ini && t <= fim) { n += e.p || 1; const k = sp(t).toISOString().slice(0, 10); porDia[k] = (porDia[k] || 0) + (e.p || 1); } }
  return { n, porDia };
}
function soltasEntre(cfg, ini, fim) {
  const a = porcoesEntre(cfg, ini, fim), b = extrasEntre(cfg, ini, fim), porDia = { ...a.porDia };
  for (const k in b.porDia) porDia[k] = (porDia[k] || 0) + b.porDia[k];
  return { n: a.n + b.n, porDia };
}
function calcular(cfg, agora) {
  const ult = tipo => { const l = cfg.eventos.filter(e => e.tipo === tipo).map(e => Date.parse(e.quando)).sort((a, b) => a - b); return l.length ? l[l.length - 1] : null; };
  const pacotes = cfg.eventos.filter(e => e.tipo === "pacote").map(e => Date.parse(e.quando)).sort((a, b) => a - b);
  const tPac = pacotes.length ? pacotes[pacotes.length - 1] : agora, tTan = ult("tanque") || tPac;
  const gDia = cfg.programacao.reduce((s, x) => s + x.p, 0) * cfg.porcaoG;
  const desdeTanque = soltasEntre(cfg, tTan, agora).n * cfg.porcaoG;
  const tanque = Math.max(0, cfg.tanqueG - desdeTanque);
  const desdePacote = soltasEntre(cfg, tPac, agora);
  const pacote = Math.max(0, cfg.pacoteG - desdePacote.n * cfg.porcaoG - tanque);   // o que está no tanque já saiu do pacote
  const diasPacote = Math.max(1 / 24, (agora - tPac) / DIA);
  const mediaPacote = desdePacote.n * cfg.porcaoG / diasPacote;
  // média acumulada: todos os pacotes já terminados (início de um até o início do próximo)
  let gTot = 0, dTot = 0;
  for (let i = 0; i + 1 < pacotes.length; i++) { gTot += cfg.pacoteG; dTot += (pacotes[i + 1] - pacotes[i]) / DIA; }
  const mediaAcum = dTot ? gTot / dTot : mediaPacote;
  // por dia da semana (últimos 28 dias) e últimas 24h
  const hist = soltasEntre(cfg, agora - 28 * DIA, agora).porDia, sem = [0, 0, 0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0, 0, 0];
  for (const k in hist) { const w = new Date(k + "T12:00:00Z").getUTCDay(); sem[w] += hist[k] * cfg.porcaoG; cnt[w]++; }
  const ult24 = soltasEntre(cfg, agora - DIA, agora).n * cfg.porcaoG;
  const diasTanque = tanque / gDia, diasPacoteRest = (pacote + tanque) / gDia;
  const ledTanque = tanque <= gDia ? "amarelo" : "ok";
  const ledPacote = diasPacoteRest <= 3 ? "vermelho" : diasPacoteRest <= 7 ? "laranja" : "ok";
  return {
    led: ledPacote !== "ok" ? ledPacote : ledTanque !== "ok" ? "amarelo" : "verde",
    aviso: ledPacote === "vermelho" ? "Recomprar ração já" : ledPacote === "laranja" ? "Recomprar ração esta semana" : ledTanque === "amarelo" ? "Repor ração no alimentador" : "Ração em dia",
    tanqueG: Math.round(tanque), tanqueDias: +diasTanque.toFixed(1), pacoteG: Math.round(pacote), pacoteDias: +diasPacoteRest.toFixed(1),
    mediaPacote: Math.round(mediaPacote), mediaAcum: Math.round(mediaAcum), ultimas24h: Math.round(ult24), gDiaProgramado: Math.round(gDia),
    porDiaSemana: sem.map((g, i) => cnt[i] ? Math.round(g / cnt[i]) : null),
    pacoteAberto: new Date(tPac).toISOString(), tanqueCheio: new Date(tTan).toISOString(), tanqueEstimado: !!cfg.eventos.find(e => e.tipo === "tanque" && Date.parse(e.quando) === tTan && e.estimado),
    config: { porcaoG: cfg.porcaoG, programacao: cfg.programacao, tanqueG: cfg.tanqueG, pacoteG: cfg.pacoteG },
  };
}
export async function onRequest({ request, env }) {
  const u = new URL(request.url);
  const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  if (!env.SD_CHAVE || u.searchParams.get("k") !== env.SD_CHAVE) return json({ erro: "abra pelo seu link pessoal" }, 401);
  if (!env.ALERTAS) return json({ erro: "falta ligar o armazenamento ALERTAS no Cloudflare" }, 503);
  let cfg = JSON.parse((await env.ALERTAS.get("joka")) || "null") || structuredClone(PADRAO);
  if (request.method === "POST") {
    const d = await request.json().catch(() => ({}));
    const agora = new Date().toISOString();
    if (d.acao === "tanque") cfg.eventos.push({ tipo: "tanque", quando: agora });
    else if (d.acao === "pacote") cfg.eventos.push({ tipo: "pacote", quando: agora }, { tipo: "tanque", quando: agora });
    else if (d.acao === "extra") cfg.eventos.push({ tipo: "extra", quando: agora, p: Math.max(1, Math.min(6, Number(d.p) || 1)) });
    else if (d.acao === "config") {
      const n = (v, a, b) => { v = Number(String(v).replace(",", ".")); return v >= a && v <= b ? v : null; };
      if (n(d.porcaoG, 1, 200)) cfg.porcaoG = n(d.porcaoG, 1, 200);
      if (n(d.tanqueG, 100, 10000)) cfg.tanqueG = n(d.tanqueG, 100, 10000);
      if (n(d.pacoteG, 100, 30000)) cfg.pacoteG = n(d.pacoteG, 100, 30000);
    } else return json({ erro: "ação desconhecida" }, 400);
    cfg.eventos = cfg.eventos.slice(-500);
    await env.ALERTAS.put("joka", JSON.stringify(cfg));
  }
  return json(calcular(cfg, Date.now()));
}
