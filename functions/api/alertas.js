// SmartDisplay — alarmes de cotação (lista guardada no Cloudflare KV "ALERTAS"; só com a chave pessoal).
const MOEDAS = ["USD", "EUR", "GBP", "JPY"];
export async function onRequest({ request, env }) {
  const u = new URL(request.url);
  const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  if (!env.SD_CHAVE || u.searchParams.get("k") !== env.SD_CHAVE) return json({ erro: "abra pelo seu link pessoal" }, 401);
  if (!env.ALERTAS) return json({ erro: "falta ligar o armazenamento ALERTAS no Cloudflare" }, 503);
  const ler = async () => JSON.parse((await env.ALERTAS.get("lista")) || "[]");
  const gravar = lista => env.ALERTAS.put("lista", JSON.stringify(lista));
  if (request.method === "GET") return json({ alertas: await ler() });
  if (request.method !== "POST") return json({ erro: "método não aceito" }, 405);
  const d = await request.json().catch(() => ({}));
  let lista = await ler();
  if (d.acao === "criar") {
    const tipo = d.tipo === "moeda" ? "moeda" : "acao";
    const ativo = String(d.ativo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const valor = Number(String(d.valor).replace(",", "."));
    const condicao = d.condicao === "abaixo" ? "abaixo" : "acima";
    if (tipo === "moeda" ? !MOEDAS.includes(ativo) : !/^[A-Z]{4}\d{1,2}$/.test(ativo)) return json({ erro: "ativo inválido" }, 400);
    if (!(valor > 0)) return json({ erro: "valor inválido" }, 400);
    if (lista.filter(a => !a.disparadoEm).length >= 30) return json({ erro: "limite de 30 alarmes ativos" }, 400);
    lista.push({ id: crypto.randomUUID().slice(0, 8), tipo, ativo, condicao, valor, criadoEm: new Date().toISOString(), disparadoEm: null, precoDisparo: null });
  } else if (d.acao === "apagar") {
    lista = lista.filter(a => a.id !== d.id);
  } else if (d.acao === "religar") {
    lista.forEach(a => { if (a.id === d.id) { a.disparadoEm = null; a.precoDisparo = null; } });
  } else return json({ erro: "ação desconhecida" }, 400);
  await gravar(lista);
  return json({ alertas: lista });
}
