/* POST /api/centi  { path, body }   cabeçalhos: x-centi-user, x-centi-token, x-centi-refresh
   Repassa ao Centi uma consulta feita com o token da própria pessoa (o Centi aplica as permissões dela).
   Só as rotas listadas em ROTAS e as consultas somente leitura "cubo-funcionario" (FP051) e "ficha-financeira" (FP024) são aceitos. O Centi renova o token sozinho; se renovar,
   o novo vem nos cabeçalhos x-centi-token e x-centi-refresh da resposta. */
const { BASE, centiPost, cuboPayload, cuboLinhas, fichaResumo, isAllowed, readBody, send } = require('./_centi');

const ROTAS = /^restauth\/(searchentity)$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { message: 'Use POST.' });
  const user = String(req.headers['x-centi-user'] || '').trim();
  const token = String(req.headers['x-centi-token'] || '');
  const refresh = String(req.headers['x-centi-refresh'] || '');
  if (!user || !token) return send(res, 401, { message: 'Sessão do Centi ausente. Entre novamente.' });
  if (!isAllowed(user)) return send(res, 403, { message: 'Usuário sem permissão neste sistema.' });
  const { path, body } = readBody(req);
  const cubo = path === 'cubo-funcionario', ficha = path === 'ficha-financeira';
  if (typeof path !== 'string' || (!cubo && !ficha && !ROTAS.test(path))) return send(res, 400, { message: 'Consulta não permitida.' });
  const mes = Number(body && body.mes), ano = Number(body && body.ano), matricula = String((body && body.matricula) || '').trim();
  if ((cubo || ficha) && !(mes >= 1 && mes <= 12 && ano >= 2000 && ano <= 2100)) return send(res, 400, { message: 'Referência inválida.' });
  if (ficha && !/^\d{1,12}$/.test(matricula)) return send(res, 400, { message: 'Matrícula inválida.' });
  try {
    const h = { user, token, refreshtoken: refresh, Authorization: 'Bearer ' + token };
    if (cubo || ficha) Object.assign(h, { company: process.env.CENTI_COMPANY || '1', year: String(ano), month: String(mes), 'x-ts-ajax-request': 'true' });
    if (ficha) {
      /* acha as fichas (uma por folha) da matrícula na referência e carrega cada uma */
      const busca = await centiPost('restauth/searchentity', { Depth: 50, Entity: 'SFichaFinanceiraPessoa', Start: 1,
        Filters: [{ FieldName: 'Matricula', List: false, Operation: 0, TypeFilter: 3, Value: matricula, between: '' }] }, h);
      const bt = busca.headers.get('token'), br = busca.headers.get('refreshtoken');
      if (bt) res.setHeader('x-centi-token', bt);
      if (br) res.setHeader('x-centi-refresh', br);
      if (busca.status === 401) return send(res, 401, { message: 'Sessão do Centi expirada.' });
      const achadas = ((busca.data && busca.data.Data) || []).filter(f => String(f.Matricula) === matricula).slice(0, 10);
      const fichas = [];
      for (const f of achadas) {
        const d = await centiPost('restauth/postdata', { Id: String(f.Id), Method: 'folha.carregarfichafinanceira' }, h);
        if (d.data && d.data.Id) fichas.push(fichaResumo(d.data));
      }
      return send(res, 200, { Fichas: fichas });
    }
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
