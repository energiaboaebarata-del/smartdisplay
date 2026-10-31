// SmartDisplay — aceita ligações/segredos salvos com espaço sobrando no nome (ex.: "   ALERTAS").
export async function onRequest(context) {
  const env = context.env;
  for (const k of Object.keys(env)) {
    const limpo = k.trim();
    if (limpo !== k && !(limpo in env)) { try { env[limpo] = env[k]; } catch (e) {} }
  }
  return context.next();
}
