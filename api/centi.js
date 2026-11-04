/* POST /api/centi  { path, body }   cabeçalhos: x-centi-user, x-centi-token, x-centi-refresh
   Repassa ao Centi uma consulta feita com o token da própria pessoa (o Centi aplica as permissões dela).
   Só as rotas listadas em ROTAS e as consultas somente leitura "cubo-funcionario" (FP051), "ficha-financeira" (FP024) "ferias" (FP051 + FP273) e "espelho-ponto" (FP170, devolve o PDF compactado em gzip) são aceitos. O Centi renova o token sozinho; se renovar,
   o novo vem nos cabeçalhos x-centi-token e x-centi-refresh da resposta. */
const { BASE, centiPost, cuboPayload, espelhoPayload, cuboLinhas, feriasPayload, feriasLinhas, fichaResumo, isAllowed, readBody, send } = require('./_centi');

const ROTAS = /^restauth\/(searchentity)$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { message: 'Use POST.' });
  const user = String(req.headers['x-centi-user'] || '').trim();
  const token = String(req.headers['x-centi-token'] || '');
  const refresh = String(req.headers['x-centi-refresh'] || '');
  if (!user || !token) return send(res, 401, { message: 'Sessão do Centi ausente. Entre novamente.' });
  if (!isAllowed(user)) return send(res, 403, { message: 'Usuário sem permissão neste sistema.' });
  const { path, body } = readBody(req);
  const cubo = path === 'cubo-funcionario', ficha = path === 'ficha-financeira', ferias = path === 'ferias', espelho = path === 'espelho-ponto';
  if (typeof path !== 'string' || (!cubo && !ficha && !ferias && !espelho && !ROTAS.test(path))) return send(res, 400, { message: 'Consulta não permitida.' });
  const mes = Number(body && body.mes), ano = Number(body && body.ano), matricula = String((body && body.matricula) || '').trim();
  if ((cubo || ficha || ferias || espelho) && !(mes >= 1 && mes <= 12 && ano >= 2000 && ano <= 2100)) return send(res, 400, { message: 'Referência inválida.' });
  if (ficha && !/^\d{1,12}$/.test(matricula)) return send(res, 400, { message: 'Matrícula inválida.' });
  try {
    const h = { user, token, refreshtoken: refresh, Authorization: 'Bearer ' + token };
    if (cubo || ficha || ferias || espelho) Object.assign(h, { company: process.env.CENTI_COMPANY || '1', year: String(ano), month: String(mes), 'x-ts-ajax-request': 'true' });
    if (espelho) {
      /* o Centi monta o PDF do órgão inteiro (leva de 25 s a 1 min). Devolvemos o gzip dele sem reabrir: a Vercel limita a resposta a 4,5 MB */
      const e = await centiPost('restauth/operation', espelhoPayload(), h);
      const t0 = e.headers.get('token'), r0 = e.headers.get('refreshtoken');
      if (t0) res.setHeader('x-centi-token', t0);
      if (r0) res.setHeader('x-centi-refresh', r0);
      const gz = e.data && e.data.File && e.data.File.DataCompress;
      if (!gz) return send(res, e.status === 401 ? 401 : 502, { message: (e.data && e.data.Message && e.data.Message[0]) || 'O Centi não devolveu o espelho de ponto.' });
      const buf = Buffer.from(gz, 'base64');
      if (buf.length > 4.4 * 1024 * 1024) return send(res, 413, { message: 'O espelho ficou grande demais para baixar por aqui (' + (buf.length / 1048576).toFixed(1) + ' MB). Gere no Centi (FP170) e anexe o PDF.' });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(buf);
    }
    if (ferias) {
      /* quadro de ativos (Cubo funcionário) + gozos de férias (Cubo movimentação férias); o direito é calculado na tela */
      const f1 = await centiPost('restauth/operation', cuboPayload(mes, ano), h);
      const t1 = f1.headers.get('token'), r1 = f1.headers.get('refreshtoken');
      if (t1) res.setHeader('x-centi-token', t1);
      if (r1) res.setHeader('x-centi-refresh', r1);
      const c1 = f1.data && f1.data.Cube;
      if (!c1) return send(res, f1.status === 401 ? 401 : 502, { message: (f1.data && f1.data.Message && f1.data.Message[0]) || 'O Centi não devolveu o cubo de funcionários.' });
      const f2 = await centiPost('restauth/operation', feriasPayload(), h);
      const c2 = f2.data && f2.data.Cube;
      if (!c2) return send(res, f2.status === 401 ? 401 : 502, { message: (f2.data && f2.data.Message && f2.data.Message[0]) || 'O Centi não devolveu o cubo de férias.' });
      const quadro = cuboLinhas(c1).map(p => ({ ID: p.ID, MATRICULA: p.MATRICULA, NOMEFUNC: p.NOMEFUNC, CARGO: p.CARGO, HIERARQUIA: p.HIERARQUIA,
        TIPOADMISSAO: p.TIPOADMISSAO, DATAADMISSAO: p.DATAADMISSAO, TIPOAFASTAMENTO: p.TIPOAFASTAMENTO }));
      return send(res, 200, { Pessoas: quadro, Gozos: feriasLinhas(c2) });
    }
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
