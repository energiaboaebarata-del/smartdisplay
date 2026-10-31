// SmartDisplay — custos fixos e despesas programadas (Cloudflare KV "ALERTAS", chave "contas"; só com a chave pessoal).
// GET  /api/contas?k=CHAVE                       → { hoje, itens }
// POST /api/contas?k=CHAVE  { acao: "salvar", item } | { acao: "apagar", id } | { acao: "pagar", id }
// Recorrentes: ao marcar "pago", o vencimento anda para o próximo período e volta a "pendente".
// "Agendado" (débito automático) anda sozinho quando a data passa.

const FREQS = ["unica", "semanal", "mensal", "bimestral", "trimestral", "semestral", "anual"];
const STATUS = ["pendente", "pago", "agendado"];
const TIPOS = ["fixo", "programada"];
const MESES = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

const hojeSP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const dataOk = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

function proximo(it) {
  const [a, m, d] = it.venc.split("-").map(Number);
  if (it.freq === "semanal") return new Date(Date.UTC(a, m - 1, d + 7)).toISOString().slice(0, 10);
  const passo = MESES[it.freq]; if (!passo) return it.venc;
  const dia = it.dia || d, alvo = new Date(Date.UTC(a, m - 1 + passo, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimo));
  return alvo.toISOString().slice(0, 10);
}

function quitar(it, quando) {
  it.ultimoPago = quando;
  if (it.freq === "unica") { it.status = "pago"; return; }
  it.venc = proximo(it);
  if (it.status === "pago") it.status = "pendente";
}

function limpar(x, antigo) {
  const nome = String(x.nome || "").trim().slice(0, 60);
  const valor = Number(String(x.valor ?? "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  if (!nome) throw new Error("dê um nome para a conta");
  if (!dataOk(x.venc)) throw new Error("data de vencimento inválida");
  return {
    id: antigo?.id || crypto.randomUUID().slice(0, 8),
    nome,
    valor: isFinite(valor) && valor >= 0 ? Math.round(valor * 100) / 100 : 0,
    venc: x.venc,
    dia: Number(x.venc.slice(8, 10)),
    freq: FREQS.includes(x.freq) ? x.freq : "mensal",
    status: STATUS.includes(x.status) ? x.status : "pendente",
    tipo: TIPOS.includes(x.tipo) ? x.tipo : "fixo",
    nota: String(x.nota || "").trim().slice(0, 120),
    ultimoPago: antigo?.ultimoPago || null,
  };
}

export async function onRequest({ request, env }) {
  const u = new URL(request.url);
  const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  if (!env.SD_CHAVE || u.searchParams.get("k") !== env.SD_CHAVE) return json({ erro: "abra pelo seu link pessoal" }, 401);
  if (!env.ALERTAS) return json({ erro: "falta ligar o armazenamento ALERTAS no Cloudflare" }, 503);

  const db = JSON.parse((await env.ALERTAS.get("contas")) || "null") || { itens: [] };
  const hoje = hojeSP();
  let mudou = false;

  // débito automático: se a data passou, considera pago e anda para o próximo período
  for (const it of db.itens) {
    let voltas = 0;
    while (it.status === "agendado" && it.venc < hoje && voltas++ < 60) {
      if (it.freq === "unica") { it.status = "pago"; it.ultimoPago = it.venc; break; }
      it.ultimoPago = it.venc; it.venc = proximo(it);
    }
    if (voltas) mudou = true;
  }

  if (request.method === "POST") {
    const d = await request.json().catch(() => ({}));
    try {
      if (d.acao === "salvar") {
        const i = db.itens.findIndex(x => x.id === d.item?.id);
        const novo = limpar(d.item || {}, i >= 0 ? db.itens[i] : null);
        if (novo.status === "pago" && novo.freq !== "unica") quitar(novo, hoje);
        if (i >= 0) db.itens[i] = novo; else { if (db.itens.length >= 200) throw new Error("limite de 200 contas"); db.itens.push(novo); }
      } else if (d.acao === "apagar") {
        db.itens = db.itens.filter(x => x.id !== d.id);
      } else if (d.acao === "pagar") {
        const it = db.itens.find(x => x.id === d.id); if (!it) throw new Error("conta não encontrada");
        quitar(it, hoje);
      } else throw new Error("ação desconhecida");
      mudou = true;
    } catch (e) { return json({ erro: e.message }, 400); }
  }

  db.itens.sort((a, b) => a.venc.localeCompare(b.venc));
  if (mudou) await env.ALERTAS.put("contas", JSON.stringify(db));
  return json({ hoje, itens: db.itens });
}
