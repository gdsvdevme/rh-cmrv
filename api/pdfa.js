/* POST /api/pdfa  { docx: <base64 do .docx> }   cabeçalhos: x-centi-user, x-centi-token, x-centi-refresh
   Converte o Word em PDF/A-2u (formato aceito pelo Tribunal de Contas) no serviço de `pdfa/` e devolve o PDF.
   Variáveis: PDFA_URL (endereço do serviço, ex.: https://pdfa.exemplo.com.br) e PDFA_TOKEN (mesma senha do serviço). */
const { isAllowed, centiGet, readBody, send } = require('./_centi');
const { sessaoInvalida } = require('./_ref');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { message: 'Use POST.' });
  const user = String(req.headers['x-centi-user'] || '').trim();
  const token = String(req.headers['x-centi-token'] || '');
  const refresh = String(req.headers['x-centi-refresh'] || '');
  if (!user || !token) return send(res, 401, { message: 'Sessão do Centi ausente. Entre novamente.' });
  if (!isAllowed(user)) return send(res, 403, { message: 'Usuário sem permissão neste sistema.' });
  /* o Centi confere o token (assinatura e validade); só então o conversor é usado. Sem isso, qualquer um forjaria um token. */
  try {
    const r = await centiGet('restauth/modules', { user, token, refreshtoken: refresh, Authorization: 'Bearer ' + token });
    if (r.status !== 200 || sessaoInvalida(r)) return send(res, 401, { message: 'Sessão do Centi inválida ou expirada. Entre novamente.' });
    /* o Centi renova o token sozinho; o novo vai nos cabeçalhos da resposta, como em api/centi.js */
    const t = r.headers.get('token'), rf = r.headers.get('refreshtoken');
    if (t) res.setHeader('x-centi-token', t);
    if (rf) res.setHeader('x-centi-refresh', rf);
  } catch (e) { return send(res, 502, { message: 'Não foi possível confirmar a sessão no Centi.' }); }
  if (!process.env.PDFA_URL || !process.env.PDFA_TOKEN) return send(res, 503, { message: 'Conversor PDF/A não configurado (PDFA_URL e PDFA_TOKEN).' });
  const { docx } = readBody(req);
  const buf = typeof docx === 'string' ? Buffer.from(docx, 'base64') : null;
  if (!buf || buf.length < 4 || buf.length > 3 * 1024 * 1024 || buf.slice(0, 2).toString() !== 'PK') return send(res, 400, { message: 'Arquivo Word inválido.' });
  try {
    const r = await fetch(process.env.PDFA_URL.replace(/\/$/, '') + '/converter', {
      method: 'POST', headers: { Authorization: 'Bearer ' + process.env.PDFA_TOKEN, 'Content-Type': 'application/octet-stream' },
      body: buf, signal: AbortSignal.timeout(50000)
    });
    if (!r.ok) return send(res, 502, { message: 'Falha na conversão para PDF/A: ' + (await r.text()).slice(0, 300) });
    const pdf = Buffer.from(await r.arrayBuffer());
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.end(pdf);
  } catch (e) { send(res, 502, { message: 'Conversor PDF/A indisponível: ' + (e.message || e) }); }
};
