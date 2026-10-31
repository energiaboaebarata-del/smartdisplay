// SmartDisplay — totais de visitas por projeto (hoje, 30 dias e desde o início).
import { SITES } from "./conta.js";
export async function onRequest({ env }) {
  const json = o => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=120" } });
  if (!env.ALERTAS) return json({ erro: "falta ligar o armazenamento ALERTAS no Cloudflare" });
  const hoje = new Date(Date.now() - 3 * 3600e3), h = hoje.toISOString().slice(0, 10);
  const corte = new Date(hoje.getTime() - 29 * 864e5).toISOString().slice(0, 10), saida = {};
  await Promise.all(SITES.map(async s => {
    const d = JSON.parse((await env.ALERTAS.get("fluxo:" + s)) || "{}");
    let t30 = 0, total = 0;
    for (const k in d) { total += d[k]; if (k >= corte) t30 += d[k]; }
    saida[s] = { hoje: d[h] || 0, dias30: t30, total };
  }));
  return json(saida);
}
