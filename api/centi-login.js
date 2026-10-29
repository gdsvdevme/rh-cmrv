/* POST /api/centi-login  { user, pass }
   Valida o acesso no Centi, confere se a pessoa está autorizada, garante a conta dela no PocketBase
   e devolve os tokens. A senha do Centi só passa por aqui e não é guardada em lugar nenhum. */
const { centiLogin, isAllowed, allowedUsers, pbPassword, readBody, send } = require('./_centi');

const PB_URL = (process.env.PB_URL || 'https://pb.devgabriel.app.br').replace(/\/+$/, '');
const COL = 'rhcmrv_users';

async function pb(method, path, body, token) {
  const r = await fetch(PB_URL + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: token } : {}),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data };
}

async function pbSession(username) {
  const password = pbPassword(username);
  let a = await pb('POST', `/api/collections/${COL}/auth-with-password`, { identity: username, password });
  if (a.status === 400) {                       // conta ainda não existe (ou a senha não confere)
    const adm = await pb('POST', '/api/collections/_superusers/auth-with-password',
      { identity: process.env.PB_ADMIN_EMAIL || '', password: process.env.PB_ADMIN_PASSWORD || '' });
    if (adm.status !== 200) throw new Error('Servidor não configurado: acesso administrativo ao PocketBase recusado.');
    const found = await pb('GET', `/api/collections/${COL}/records?perPage=1&filter=${encodeURIComponent('username="' + username.replace(/["\\]/g, '') + '"')}`, undefined, adm.data.token);
    if (found.data && found.data.items && found.data.items.length)
      throw new Error('Já existe uma conta com este nome no sistema, criada por outro meio. Peça ao administrador para removê-la.');
    const c = await pb('POST', `/api/collections/${COL}/records`, { username, password, passwordConfirm: password }, adm.data.token);
    if (c.status !== 200) throw new Error('Não foi possível criar a conta no PocketBase.');
    a = await pb('POST', `/api/collections/${COL}/auth-with-password`, { identity: username, password });
  }
  if (a.status !== 200) throw new Error('Não foi possível abrir a sessão no PocketBase.');
  return { token: a.data.token, record: { id: a.data.record.id, username } };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { message: 'Use POST.' });
  if (!process.env.APP_SECRET || !allowedUsers().length)
    return send(res, 503, { message: 'Servidor sem configuração: defina APP_SECRET e CENTI_ALLOWED_USERS.' });
  const { user, pass } = readBody(req);
  if (typeof user !== 'string' || typeof pass !== 'string' || !user.trim() || !pass || user.length > 120 || pass.length > 200)
    return send(res, 400, { message: 'Informe usuário e senha do Centi.' });
  const username = user.trim().toLowerCase();
  if (!isAllowed(username))
    return send(res, 403, { message: 'Este usuário do Centi não tem permissão para usar este sistema.' });
  try {
    const c = await centiLogin(user.trim(), pass);
    const d = c.data || {};
    if (!d.Success && !d.Token) return send(res, 401, { message: (d.Message && d.Message[0]) || 'Usuário ou senha do Centi incorretos.' });
    if (d.Tokenized || !d.Token) return send(res, 401, { message: 'Este usuário exige confirmação por PIN no Centi, o que o sistema ainda não suporta.' });
    const session = await pbSession(username);
    return send(res, 200, {
      pb: session,
      centi: { user: username, nome: d.FullName || username, token: d.Token, refreshToken: d.RefreshToken }
    });
  } catch (e) {
    return send(res, 502, { message: e.message || 'Falha ao entrar.' });
  }
};
