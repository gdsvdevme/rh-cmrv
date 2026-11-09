/* POST /api/pdfa  { docx: <base64 do .docx> }   cabeçalhos: x-centi-user, x-centi-token
   Converte o Word em PDF/A-2u (formato aceito pelo Tribunal de Contas) no serviço de `pdfa/` e devolve o PDF.
   Variáveis: PDFA_URL (endereço do serviço, ex.: https://pdfa.exemplo.com.br) e PDFA_TOKEN (mesma senha do serviço). */
const { isAllowed, usuarioDoToken, readBody, send } = require('./_centi');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { message: 'Use POST.' });
  const user = String(req.headers['x-centi-user'] || '').trim();
  const token = String(req.headers['x-centi-token'] || '');
  if (!user || !token) return send(res, 401, { message: 'Sessão do Centi ausente. Entre novamente.' });
  if (!isAllowed(user)) return send(res, 403, { message: 'Usuário sem permissão neste sistema.' });
  /* o token precisa ser do mesmo usuário e não estar vencido (a assinatura é do Centi; aqui só barramos o uso indevido do conversor) */
  try {
    const c = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    const dono = String(c.User || c.unique_name || '').trim().toLowerCase();
    if (!dono || dono !== user.toLowerCase() || (c.exp && c.exp * 1000 < Date.now() - 3600e3)) throw new Error('x');
  } catch (e) { return send(res, 401, { message: 'Sessão do Centi inválida. Entre novamente.' }); }
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
