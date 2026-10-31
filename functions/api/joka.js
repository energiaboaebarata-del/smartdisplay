// SmartDisplay — controle da ração do Joka (dados no Cloudflare KV "ALERTAS", chave "joka"; só com a chave pessoal).
// Conta o que o alimentador solta pela programação (+ doses extras registradas). O que sai do tanque sai do pacote.
const PADRAO = {
  porcaoG: 17.5,                                         // média de 4 pesagens (31/10/2026)
  programacao: [{ h: 7, p: 3 }, { h: 13, p: 1 }, { h: 18, p: 2 }],
  tanqueG: 1000,                                         // modelo pequeno (~23 cm): estimativa, ajustável
  pacoteG: 2500,                                         // N&D raça mini 2,5 kg
  avisoRecompraDias: 7,                                  // sinaliza recompra a 1 semana do fim (laranja); vermelho a 2 dias
  eventos: [{ tipo: "pacote", quando: "2026-10-07T12:00:00-03:00", estimado: true },   // comprado em 05/10; abertura aproximada
            { tipo: "tanque", quando: "2026-10-27T12:00:00-03:00", estimado: true },
            { tipo: "estoque", quando: "2026-10-31T01:59:00-03:00", sacoG: 750 }],    // "cerca de 30% no saco"
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
  const tempos = tipo => cfg.eventos.filter(e => e.tipo === tipo).map(e => ({ ...e, t: Date.parse(e.quando) })).sort((a, b) => a.t - b.t);
  const pacotes = tempos("pacote"), tanques = tempos("tanque"), estoques = tempos("estoque");
  const pac = pacotes.length ? pacotes[pacotes.length - 1] : { t: agora };
  const tTan = tanques.length ? tanques[tanques.length - 1].t : pac.t;
  const calib = estoques.filter(e => e.t >= pac.t).pop();               // conferência do saco depois do pacote atual
  const gProg = cfg.programacao.reduce((s, x) => s + x.p, 0) * cfg.porcaoG;
  const extras = (ini, fim) => extrasEntre(cfg, ini, fim).n * cfg.porcaoG;
  // ritmo real: pela conferência do saco (o que saiu do pacote ÷ dias); sem conferência, pela programação
  let ritmo = gProg, base = "programação";
  if (calib && calib.t - pac.t > 2 * DIA) { ritmo = Math.max(10, (cfg.pacoteG - calib.sacoG) / ((calib.t - pac.t) / DIA)); base = "conferência do saco"; }
  // média acumulada: pacotes já terminados (de um início ao próximo)
  let gTot = 0, dTot = 0;
  for (let i = 0; i + 1 < pacotes.length; i++) { gTot += cfg.pacoteG; dTot += (pacotes[i + 1].t - pacotes[i].t) / DIA; }
  const mediaAcum = dTot ? gTot / dTot : ritmo;
  const tanqueEm = t => Math.max(0, cfg.tanqueG - ritmo * Math.max(0, t - tTan) / DIA - extras(tTan, t));
  const tanque = tanqueEm(agora);
  let total;                                                             // saco + tanque
  if (calib) total = calib.sacoG + tanqueEm(calib.t) - ritmo * (agora - calib.t) / DIA - extras(calib.t, agora);
  else total = cfg.pacoteG - ritmo * (agora - pac.t) / DIA - extras(pac.t, agora);
  total = Math.max(0, total);
  const saco = Math.max(0, total - tanque);
  const ult24 = ritmo + extras(agora - DIA, agora);
  const porDia = [0, 0, 0, 0, 0, 0, 0].map(() => Math.round(ritmo));
  for (const e of cfg.eventos) if (e.tipo === "extra") { const t = Date.parse(e.quando); if (t > agora - 28 * DIA) porDia[sp(t).getUTCDay()] += Math.round((e.p || 1) * cfg.porcaoG / 4); }
  const diasTanque = tanque / ritmo, diasTotal = total / ritmo, aviso = cfg.avisoRecompraDias || 7;
  const ledTanque = diasTanque <= 1 ? "amarelo" : "ok";
  const ledPacote = diasTotal <= 2 ? "vermelho" : diasTotal <= aviso ? "laranja" : "ok";
  return {
    led: ledPacote !== "ok" ? ledPacote : ledTanque !== "ok" ? "amarelo" : "verde",
    aviso: ledPacote === "vermelho" ? "Recomprar ração já" : ledPacote === "laranja" ? "Recomprar ração (≈ " + Math.round(diasTotal) + " dias)" : ledTanque === "amarelo" ? "Repor ração no alimentador" : "Ração em dia · " + Math.round(diasTotal) + " dias",
    tanqueG: Math.round(tanque), tanqueDias: +diasTanque.toFixed(1), pacoteG: Math.round(saco), pacoteDias: +diasTotal.toFixed(1),
    mediaPacote: Math.round(ritmo), mediaAcum: Math.round(mediaAcum), ultimas24h: Math.round(ult24), gDiaProgramado: Math.round(gProg),
    porDiaSemana: porDia, base, avisoRecompraDias: aviso,
    pacoteAberto: new Date(pac.t).toISOString(), pacoteEstimado: !!pac.estimado, tanqueCheio: new Date(tTan).toISOString(),
    tanqueEstimado: !!(tanques.length && tanques[tanques.length - 1].estimado), conferido: calib ? new Date(calib.t).toISOString() : null,
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
    else if (d.acao === "estoque") { const pct = Number(d.pct); if (!(pct >= 0 && pct <= 100)) return json({ erro: "porcentagem inválida" }, 400); cfg.eventos.push({ tipo: "estoque", quando: agora, sacoG: Math.round(cfg.pacoteG * pct / 100) }); }
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
