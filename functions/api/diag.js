// SmartDisplay — diagnóstico (só com a chave pessoal). Mostra NOMES das ligações, nunca os valores.
export async function onRequest({ request, env }) {
  const u = new URL(request.url);
  const json = o => new Response(JSON.stringify(o, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  if (!env.SD_CHAVE || u.searchParams.get("k") !== env.SD_CHAVE) return json({ erro: "abra pelo seu link pessoal" });
  const ligacoes = {};
  for (const k of Object.keys(env)) {
    const v = env[k];
    ligacoes[k] = typeof v === "string" ? "texto/segredo (" + v.length + " caracteres" + (v !== v.trim() ? ", COM ESPAÇO SOBRANDO" : "") + ")"
      : v && typeof v.get === "function" && typeof v.put === "function" ? "cofre KV" : typeof v;
  }
  let prumo;
  try {
    const r = await fetch((env.PRUMO_URL || "https://prumo.s2bt.com.br") + "/api/hoje", { headers: { Authorization: "Bearer " + String(env.PRUMO_TOKEN || "").trim() } });
    const txt = await r.text();
    prumo = { status: r.status, resposta: txt.slice(0, 160) };
  } catch (e) { prumo = { erro: String(e.message || e) }; }
  let kv = "sem cofre";
  if (env.ALERTAS) { try { await env.ALERTAS.get("diag"); kv = "cofre respondeu ok"; } catch (e) { kv = "cofre com erro: " + e.message; } }
  return json({ ligacoes, kv, prumo });
}
