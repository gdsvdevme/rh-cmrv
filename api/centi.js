/* POST /api/centi  { path, body }   cabeçalhos: x-centi-user, x-centi-token, x-centi-refresh
   Repassa ao Centi uma consulta feita com o token da própria pessoa (o Centi aplica as permissões dela).
   Só as rotas listadas em ROTAS e o "cubo-funcionario" (Cubo funcionário, FP051, só leitura) são aceitos. O Centi renova o token sozinho; se renovar,
   o novo vem nos cabeçalhos x-centi-token e x-centi-refresh da resposta. */
const { BASE, centiPost, cuboPayload, cuboLinhas, isAllowed, readBody, send } = require('./_centi');

const ROTAS = /^restauth\/(searchentity)$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { message: 'Use POST.' });
  const user = String(req.headers['x-centi-user'] || '').trim();
  const token = String(req.headers['x-centi-token'] || '');
  const refresh = String(req.headers['x-centi-refresh'] || '');
  if (!user || !token) return send(res, 401, { message: 'Sessão do Centi ausente. Entre novamente.' });
  if (!isAllowed(user)) return send(res, 403, { message: 'Usuário sem permissão neste sistema.' });
  const { path, body } = readBody(req);
  const cubo = path === 'cubo-funcionario';
  if (typeof path !== 'string' || (!cubo && !ROTAS.test(path))) return send(res, 400, { message: 'Consulta não permitida.' });
  const mes = Number(body && body.mes), ano = Number(body && body.ano);
  if (cubo && !(mes >= 1 && mes <= 12 && ano >= 2000 && ano <= 2100)) return send(res, 400, { message: 'Referência inválida.' });
  try {
    const h = { user, token, refreshtoken: refresh, Authorization: 'Bearer ' + token };
    if (cubo) Object.assign(h, { company: process.env.CENTI_COMPANY || '1', year: String(ano), month: String(mes), 'x-ts-ajax-request': 'true' });
    const r = await centiPost(cubo ? 'restauth/operation' : path, cubo ? cuboPayload(mes, ano) : (body || {}), h);
    const nt = r.headers.get('token'), nr = r.headers.get('refreshtoken');
    if (nt) res.setHeader('x-centi-token', nt);
    if (nr) res.setHeader('x-centi-refresh', nr);
    if (cubo) {
      const cube = r.data && r.data.Cube;
      if (!cube) return send(res, r.status === 401 ? 401 : 502, { message: (r.data && r.data.Message && r.data.Message[0]) || 'O Centi não devolveu o cubo de funcionários.' });
      return send(res, 200, { Data: cuboLinhas(cube), Total: (cube.Rows || []).length });
    }
    return send(res, r.status === 401 ? 401 : 200, r.data == null ? {} : r.data);
  } catch (e) {
    return send(res, 502, { message: 'Não foi possível falar com o Centi.' });
  }
};
