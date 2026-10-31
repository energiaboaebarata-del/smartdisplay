// Vigia de cotações do SmartDisplay (Cloudflare Worker com horário programado a cada 15 minutos).
// Confere os alarmes guardados em ALERTAS; quando um é atingido, manda e-mail pela Brevo e desliga o alarme.
// Precisa: armazenamento KV "ALERTAS", segredos BREVO_API_KEY e BRAPI_TOKEN. Opcional: EMAIL_DESTINO, EMAIL_REMETENTE.
const NOMES = { USD: "Dólar", EUR: "Euro", GBP: "Libra", JPY: "Iene" };
const br = (v, c = 2) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });

async function precoMoedas(codigos) {
  if (!codigos.length) return {};
  const r = await fetch("https://economia.awesomeapi.com.br/json/last/" + codigos.map(c => c + "-BRL").join(","));
  const j = await r.json(), saida = {};
  codigos.forEach(c => { const q = j[c + "BRL"]; if (q) saida[c] = Number(q.bid); });
  return saida;
}
async function precoAcao(t, env) {
  const r = await fetch("https://brapi.dev/api/quote/" + t + "?token=" + encodeURIComponent(env.BRAPI_TOKEN || ""));
  const j = await r.json(), a = j.results && j.results[0];
  return a && a.regularMarketPrice != null ? Number(a.regularMarketPrice) : null;
}
async function email(env, assunto, html) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      sender: { name: "SmartDisplay", email: env.EMAIL_REMETENTE || "rafael@s2bt.com.br" },
      to: [{ email: env.EMAIL_DESTINO || "energiaboaebarata@gmail.com", name: "Rafael" }],
      subject: assunto, htmlContent: html,
    }),
  });
  if (!r.ok) throw new Error("Brevo " + r.status + " " + (await r.text()).slice(0, 200));
}
async function conferir(env) {
  const lista = JSON.parse((await env.ALERTAS.get("lista")) || "[]");
  const ativos = lista.filter(a => !a.disparadoEm);
  if (!ativos.length) return { conferidos: 0, disparados: 0 };
  const moedas = await precoMoedas([...new Set(ativos.filter(a => a.tipo === "moeda").map(a => a.ativo))]).catch(() => ({}));
  const acoes = {};
  for (const t of new Set(ativos.filter(a => a.tipo === "acao").map(a => a.ativo))) acoes[t] = await precoAcao(t, env).catch(() => null);
  let disparados = 0;
  for (const a of ativos) {
    const p = a.tipo === "moeda" ? moedas[a.ativo] : acoes[a.ativo];
    if (p == null) continue;
    const bateu = a.condicao === "acima" ? p >= a.valor : p <= a.valor;
    if (!bateu) continue;
    const nome = a.tipo === "moeda" ? NOMES[a.ativo] : a.ativo, casas = a.ativo === "JPY" ? 4 : 2;
    const assunto = "🔔 " + nome + " " + (a.condicao === "acima" ? "chegou a" : "caiu para") + " R$ " + br(p, casas);
    const html = "<p style='font:16px Arial'>Seu alarme do SmartDisplay tocou.</p>" +
      "<p style='font:16px Arial'><b>" + nome + "</b> está em <b>R$ " + br(p, casas) + "</b> (alarme: " + a.condicao + " de R$ " + br(a.valor, casas) + ").</p>" +
      "<p style='font:13px Arial;color:#666'>O alarme foi desligado. Para religar, abra o SmartDisplay.</p>";
    try { await email(env, assunto, html); } catch (e) { a.erroEmail = String(e.message || e); }
    a.disparadoEm = new Date().toISOString(); a.precoDisparo = p; disparados++;
  }
  if (disparados) await env.ALERTAS.put("lista", JSON.stringify(lista));
  return { conferidos: ativos.length, disparados };
}
export default {
  async scheduled(evento, env, ctx) { ctx.waitUntil(conferir(env)); },
  async fetch(req, env) {  // abrir o endereço do vigia no navegador faz uma conferência na hora (para testar)
    try { return Response.json(await conferir(env)); } catch (e) { return Response.json({ erro: String(e.message || e) }, { status: 500 }); }
  },
};
