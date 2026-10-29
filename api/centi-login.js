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

/* Coleção das tarefas do RH (checklist). Criada no primeiro login depois da atualização, se ainda não existir.
   Regras: a tarefa compartilhada é de toda a equipe; a privada só aparece para o dono. O dono não pode ser trocado. */
const AUTH = '@request.auth.collectionName = "rhcmrv_users"';
const TAREFAS_REGRAS = {
  listRule: AUTH + ' && (compartilhada = true || dono = @request.auth.id)',
  viewRule: AUTH + ' && (compartilhada = true || dono = @request.auth.id)',
  createRule: AUTH + ' && @request.body.dono = @request.auth.id',
  updateRule: AUTH + ' && (compartilhada = true || dono = @request.auth.id) && @request.body.dono:isset = false && (@request.body.compartilhada:isset = false || dono = @request.auth.id)',
  deleteRule: AUTH + ' && (compartilhada = true || dono = @request.auth.id)'
};
let tarefasOk = false;
const campoTxt = (name, max, extra) => Object.assign({ name, type: 'text', required: false, max }, extra || {});
const CAMPOS_BASE = [campoTxt('titulo', 200, { required: true }), campoTxt('descricao', 4000), campoTxt('coluna', 20),
  { name: 'compartilhada', type: 'bool' }, campoTxt('dono', 40, { required: true }), campoTxt('autor', 120),
  campoTxt('prioridade', 20), campoTxt('prazo', 10), campoTxt('criada_em', 40), campoTxt('concluido_em', 10)];
/* recorrência mensal: modelo (coluna "modelo", nunca aparece no quadro) + uma ocorrência por mês (serie = id do modelo, ciclo = AAAA-MM) */
const CAMPOS_RECORRENCIA = [campoTxt('recorrencia', 10), campoTxt('dia_prazo', 2), campoTxt('serie', 40), campoTxt('ciclo', 7)];

async function tokenAdmin() {
  const adm = await pb('POST', '/api/collections/_superusers/auth-with-password',
    { identity: process.env.PB_ADMIN_EMAIL || '', password: process.env.PB_ADMIN_PASSWORD || '' });
  if (adm.status !== 200) { console.error('rhcmrv_tarefas: acesso administrativo ao PocketBase recusado (HTTP ' + adm.status + ')'); return null; }
  return adm.data.token;
}
async function garantirTarefas(userToken) {
  if (tarefasOk) return;
  /* o filtro por "serie" só é aceito se o campo existe: 404 = coleção não existe; 400 = coleção antiga, sem os campos da recorrência */
  const t = await pb('GET', '/api/collections/rhcmrv_tarefas/records?perPage=1&filter=' + encodeURIComponent('serie = ""'), undefined, userToken);
  if (t.status !== 404 && t.status !== 400) { tarefasOk = true; return; }
  const adm = await tokenAdmin();
  if (!adm) return;                                       // sem acesso administrativo: o setup.py cria/atualiza depois
  if (t.status === 404) {
    const c = await pb('POST', '/api/collections', Object.assign({
      name: 'rhcmrv_tarefas', type: 'base', fields: CAMPOS_BASE.concat(CAMPOS_RECORRENCIA),
      indexes: ['CREATE INDEX idx_rhcmrv_tarefas_dono ON rhcmrv_tarefas (dono)']
    }, TAREFAS_REGRAS), adm);
    if (c.status === 200) tarefasOk = true;
    else console.error('rhcmrv_tarefas: não foi possível criar a coleção (HTTP ' + c.status + '): ' + JSON.stringify(c.data).slice(0, 400));
    return;
  }
  /* coleção antiga: acrescenta só os campos que faltam, mantendo os existentes (com os ids) para não perder dados */
  const col = await pb('GET', '/api/collections/rhcmrv_tarefas', undefined, adm);
  if (col.status !== 200) { console.error('rhcmrv_tarefas: não foi possível ler a coleção (HTTP ' + col.status + ')'); return; }
  const tem = new Set((col.data.fields || []).map(f => f.name));
  const faltam = CAMPOS_RECORRENCIA.filter(f => !tem.has(f.name));
  if (!faltam.length) { tarefasOk = true; return; }
  const u = await pb('PATCH', '/api/collections/rhcmrv_tarefas', { fields: (col.data.fields || []).concat(faltam) }, adm);
  if (u.status === 200) tarefasOk = true;
  else console.error('rhcmrv_tarefas: não foi possível acrescentar os campos da recorrência (HTTP ' + u.status + '): ' + JSON.stringify(u.data).slice(0, 400));
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
    try { await garantirTarefas(session.token); } catch (e) { /* não impede o login */ }
    return send(res, 200, {
      pb: session,
      centi: { user: username, nome: d.FullName || username, token: d.Token, refreshToken: d.RefreshToken }
    });
  } catch (e) {
    return send(res, 502, { message: e.message || 'Falha ao entrar.' });
  }
};
module.exports.garantirTarefas = garantirTarefas;   // exportada para teste
module.exports._reset = () => { tarefasOk = false; };
