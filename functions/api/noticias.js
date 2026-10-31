// SmartDisplay — notícias de um assunto escolhido por você: /api/noticias?q=Flamengo
import { noticiasBusca } from "../../lib/rss.js";

export async function onRequest({ request }) {
  const q = (new URL(request.url).searchParams.get("q") || "Flamengo").trim().slice(0, 60);
  let corpo;
  try { corpo = { q, ...(await noticiasBusca(q, 4)) }; }
  catch (e) { corpo = { q, erro: String(e.message || e), itens: [] }; }
  return new Response(JSON.stringify(corpo), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=600" },
  });
}
