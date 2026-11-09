// SmartDisplay — atalhos do Claude (diretorias e projetos da S2BT e da Smart Spin), guardados no KV "ALERTAS", chave "claude".
// GET  /api/claude?k=CHAVE
// POST /api/claude?k=CHAVE  { acao:"salvar", grupo, lista, indice?, item:{nome,url} } | { acao:"apagar", grupo, lista, indice }
const PADRAO = {
  s2bt: {
    diretorias: ["TI", "Marketing", "Mídias Sociais", "Financeiro", "Operação"].map(nome => ({ nome, url: "" })),
    projetos: ["Plataforma S2BT", "LLE · Leads Estratégicos", "Rede de parceiros"].map(nome => ({ nome, url: "" })),
  },
  smartspin: {
    diretorias: [],
    projetos: ["SmartDisplay", "Rolê BR", "Prumo", "Bola", "Tatame", "Cupom", "Comparador", "Viagens", "Casa inteligente"].map(nome => ({ nome, url: "" })),
  },
};
const GRUPOS = ["s2bt", "smartspin"], LISTAS = ["diretorias", "projetos"];

export async function onRequest({ request, env }) {
  const u = new URL(request.url);
  const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  if (!env.SD_CHAVE || u.searchParams.get("k") !== env.SD_CHAVE) return json({ erro: "abra pelo seu link pessoal" }, 401);
  if (!env.ALERTAS) return json({ erro: "falta ligar o armazenamento ALERTAS no Cloudflare" }, 503);
  const db = JSON.parse((await env.ALERTAS.get("claude")) || "null") || JSON.parse(JSON.stringify(PADRAO));
  if (request.method === "POST") {
    const d = await request.json().catch(() => ({}));
    if (!GRUPOS.includes(d.grupo) || !LISTAS.includes(d.lista)) return json({ erro: "lista inválida" }, 400);
    const L = db[d.grupo][d.lista];
    if (d.acao === "salvar") {
      const nome = String(d.item?.nome || "").trim().slice(0, 60);
      let url = String(d.item?.url || "").trim();
      if (!nome) return json({ erro: "dê um nome" }, 400);
      if (url && !/^https:\/\/claude\.ai\//.test(url)) return json({ erro: "o link precisa começar com https://claude.ai/" }, 400);
      url = url.slice(0, 300);
      if (Number.isInteger(d.indice) && L[d.indice]) L[d.indice] = { nome, url };
      else { if (L.length >= 60) return json({ erro: "limite de 60 itens" }, 400); L.push({ nome, url }); }
    } else if (d.acao === "apagar") {
      if (Number.isInteger(d.indice)) L.splice(d.indice, 1);
    } else return json({ erro: "ação desconhecida" }, 400);
    await env.ALERTAS.put("claude", JSON.stringify(db));
  }
  return json(db);
}
