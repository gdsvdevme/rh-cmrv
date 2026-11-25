/* POST /api/centi  { path, body }   cabeçalhos: x-centi-user, x-centi-token, x-centi-refresh
   Repassa ao Centi uma consulta feita com o token da própria pessoa (o Centi aplica as permissões dela).
   Só as rotas listadas em ROTAS e as consultas somente leitura "cubo-funcionario" (FP051), "ficha-financeira" (FP024) "ferias" (FP051 + FP273),
   "conferencia-remuneracao" (fichas financeiras da matrícula no mês e no anterior, em lotes de até 40), "conferencia-eventos" (lançamentos de evento por servidor: recorrência e datas, em lotes de até 60 servidores), "licenca-busca" (busca de servidor por nome ou matrícula), "licenca-quadro" (FP245), "espelho-ponto" (FP170) e "afastamentos-pdf" (FP071, do órgão ou de um servidor; os dois últimos devolvem o PDF compactado em gzip) são aceitos. O Centi renova o token sozinho; se renovar,
   o novo vem nos cabeçalhos x-centi-token e x-centi-refresh da resposta. */
const { BASE, centiPost, chaveDaTela, cuboPayload, espelhoPayload, quadroPayload, quadroLinhas, afastamentosPayload, buscaFiltro, buscaLinhas, fichaEnxuta, mesAnterior, eventosFiltros, eventoLinha, eventoFiltroNome, eventoCodigo, servidorDados, idPessoaDoFuncionario, centiGet, cuboLinhas, feriasPayload, feriasLinhas, fichaResumo, isAllowed, readBody, send } = require('./_centi');

const { semFolha, referencias, sessaoInvalida } = require('./_ref');

/* toda chamada ao Centi passa por aqui: sessão inválida vira erro "expirou", respondido como 401 no fim da função */
const post = async (...a) => {
  const r = await centiPost(...a);
  if (sessaoInvalida(r)) { const e = new Error('Sessão do Centi expirada.'); e.expirou = true; throw e; }
  return r;
};

/* número da tela no Centi de hoje (ver chaveDaTela em _centi.js); sessão inválida no menu vira erro "expirou" como em post() */
async function tela(codigo, payload, h) {
  const r = await chaveDaTela(codigo, payload.ModuleKey, h);
  if (r.falhou && sessaoInvalida(r.falhou)) { const e = new Error('Sessão do Centi expirada.'); e.expirou = true; throw e; }
  payload.ModuleKey = r.chave;
  return payload;
}

const CODIGOS = new Map();   // nome do evento -> código, aproveitado entre chamadas enquanto a função está ativa
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
  const evlote = path === 'conferencia-eventos', remlote = path === 'conferencia-remuneracao';
  const quadro = path === 'licenca-quadro', afast = path === 'afastamentos-pdf', busca = path === 'licenca-busca', dados = path === 'servidor-dados';
  if (typeof path !== 'string' || (!cubo && !evlote && !remlote && !ficha && !ferias && !espelho && !quadro && !afast && !busca && !dados && !ROTAS.test(path))) return send(res, 400, { message: 'Consulta não permitida.' });
  const mes = Number(body && body.mes), ano = Number(body && body.ano), matricula = String((body && body.matricula) || '').trim();
  if ((cubo || evlote || remlote || ficha || ferias || espelho || quadro || afast) && !(mes >= 1 && mes <= 12 && ano >= 2000 && ano <= 2100)) return send(res, 400, { message: 'Referência inválida.' });
  if (ficha && !/^\d{1,12}$/.test(matricula)) return send(res, 400, { message: 'Matrícula inválida.' });
  const funcionario = String((body && body.funcionario) || '').trim();
  if ((afast || espelho) && funcionario && !/^\d{1,12}$/.test(funcionario)) return send(res, 400, { message: 'Servidor inválido.' });
  const ids = evlote ? (Array.isArray(body && body.ids) ? body.ids.map(String) : []) : [];
  if (evlote && (!ids.length || ids.length > 60 || !ids.every(i => /^\d{1,12}$/.test(i)))) return send(res, 400, { message: 'Lista de servidores inválida.' });
  const mats = remlote ? (Array.isArray(body && body.matriculas) ? body.matriculas.map(String) : []) : [];
  if (remlote && (!mats.length || mats.length > 40 || !mats.every(m => /^\d{1,12}$/.test(m)))) return send(res, 400, { message: 'Lista de matrículas inválida.' });
  const idServidor = String((body && body.id) || '').trim();
  if (dados && !/^\d{1,12}$/.test(idServidor)) return send(res, 400, { message: 'Servidor inválido.' });
  const filtroBusca = busca ? buscaFiltro(body && body.termo) : null;
  if (busca && !filtroBusca) return send(res, 400, { message: 'Digite ao menos 3 letras do nome ou a matrícula.' });
  try {
    const h = { user, token, refreshtoken: refresh, Authorization: 'Bearer ' + token };
    if (cubo || evlote || remlote || ficha || ferias || espelho || quadro || afast) Object.assign(h, { company: process.env.CENTI_COMPANY || '1', year: String(ano), month: String(mes), 'x-ts-ajax-request': 'true' });
    if (espelho || afast) {
      /* o Centi monta o PDF (o espelho do órgão inteiro leva de 25 s a 1 min). Devolvemos o gzip dele sem reabrir: a Vercel limita a resposta a 4,5 MB */
      let e, usada = { mes, ano };
      let modKey = null;
      if (espelho) {
        const pl = await tela('FP170', espelhoPayload(funcionario), h); modKey = pl.ModuleKey; e = await post('restauth/operation', pl, h);
        /* se o Centi recusar o filtro por servidor, pede o órgão inteiro (a tela recorta as páginas da pessoa) */
        if (funcionario && !(e.data && e.data.File && e.data.File.DataCompress)) { const pl2 = await tela('FP170', espelhoPayload(), h); e = await post('restauth/operation', pl2, h); }
      }
      else {
        /* se a folha do mês pedido ainda não foi processada, o Centi recusa: tenta o mês anterior (e mais um) */
        for (const ref of referencias(mes, ano, 3)) {
          e = await post('restauth/operation', await tela('FP071', afastamentosPayload(mes, ano, funcionario, ref), h), Object.assign({}, h, { year: String(ref.ano), month: String(ref.mes) }));
          usada = ref;
          if (!semFolha(e)) break;
        }
        res.setHeader('x-centi-ref', String(usada.mes).padStart(2, '0') + '/' + usada.ano);
      }
      const t0 = e.headers.get('token'), r0 = e.headers.get('refreshtoken');
      if (t0) res.setHeader('x-centi-token', t0);
      if (r0) res.setHeader('x-centi-refresh', r0);
      const gz = e.data && e.data.File && e.data.File.DataCompress;
      if (!gz && espelho) {
        /* sem PDF e sem mensagem: devolve o que o Centi respondeu (sem tokens) para dar para ver a causa */
        const d = e.data && typeof e.data === 'object' ? e.data : {};
        const det = 'Centi: HTTP ' + e.status + (d.ErrorCode ? ', código ' + d.ErrorCode : '') + ', tela ' + modKey + ', referência ' + String(mes).padStart(2, '0') + '/' + ano
          + ', campos [' + Object.keys(d).join(', ') + ']' + (d.Message && d.Message.length ? ', mensagem: ' + [].concat(d.Message).join(' | ') : '') + (d.Success === false ? ', Success=false' : '');
        console.error('espelho-ponto sem PDF', det, JSON.stringify(d).slice(0, 800));
        if (!(d.Message && d.Message[0])) return send(res, e.status === 401 ? 401 : 502, { message: 'O Centi não devolveu o espelho de ponto. (' + det + ')' });
      }
      if (!gz) return send(res, e.status === 401 ? 401 : 502, { message: ((e.data && e.data.Message && e.data.Message[0]) || (espelho ? 'O Centi não devolveu o espelho de ponto.' : 'O Centi não devolveu a relação de afastamentos.')).replace(/\.?\s*$/, '.') + (afast && semFolha(e) ? ' Tentei também os dois meses anteriores.' : '') });
      const buf = Buffer.from(gz, 'base64');
      if (buf.length > 4.4 * 1024 * 1024) return send(res, 413, { message: espelho
        ? 'O espelho ficou grande demais para baixar por aqui (' + (buf.length / 1048576).toFixed(1) + ' MB). Gere no Centi (FP170) e anexe o PDF.'
        : 'A relação de afastamentos ficou grande demais para baixar por aqui (' + (buf.length / 1048576).toFixed(1) + ' MB).' });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(buf);
    }
    if (remlote) {
      /* fichas financeiras (FP024) de cada matrícula no mês pedido e no anterior; 8 matrículas ao mesmo tempo */
      const ant = mesAnterior(mes, ano), saida = {};
      let tk = '', rf = '';
      const um = async mat => {
        const o = saida[mat] = {};
        for (const [chave, ref] of [['Atual', { mes, ano }], ['Anterior', ant]]) {
          const hr = Object.assign({}, h, { year: String(ref.ano), month: String(ref.mes) });
          const b = await post('restauth/searchentity', { Depth: 50, Entity: 'SFichaFinanceiraPessoa', Start: 1,
            Filters: [{ FieldName: 'Matricula', List: false, Operation: 0, TypeFilter: 3, Value: mat, between: '' }] }, hr);
          tk = b.headers.get('token') || tk; rf = b.headers.get('refreshtoken') || rf;
          if (!b.data || b.data.Success === false) { const e = new Error((b.data && b.data.Message && b.data.Message[0]) || 'O Centi não respondeu.'); e.centi = true; throw e; }
          o[chave] = [];
          for (const f of (b.data.Data || []).filter(x => String(x.Matricula) === mat).slice(0, 10)) {
            const d = await post('restauth/postdata', { Id: String(f.Id), Method: 'folha.carregarfichafinanceira' }, hr);
            if (d.data && d.data.Id) o[chave].push(fichaEnxuta(fichaResumo(d.data)));
          }
        }
      };
      const fila = mats.slice();
      await Promise.all(Array.from({ length: Math.min(8, fila.length) }, async () => { while (fila.length) await um(fila.shift()); }));
      if (tk) res.setHeader('x-centi-token', tk);
      if (rf) res.setHeader('x-centi-refresh', rf);
      return send(res, 200, { Servidores: saida, Anterior: ant });
    }
    if (evlote) {
      /* lançamentos de evento (determinação) dos servidores do lote; 8 consultas ao mesmo tempo */
      const linhas = new Map(), truncados = new Set();
      let tk = '', rf = '';
      const um = async id => {
        for (const filtros of eventosFiltros(id, mes, ano)) {
          const r = await post('restauth/searchentity', { Depth: 50, Entity: 'PessoaFuncionarioEvento', Start: 1, Filters: filtros }, h);
          tk = r.headers.get('token') || tk; rf = r.headers.get('refreshtoken') || rf;
          if (!r.data || r.data.Success === false) { const e = new Error((r.data && r.data.Message && r.data.Message[0]) || 'O Centi não respondeu.'); e.centi = true; throw e; }
          const d = r.data.Data || [];
          if (d.length >= 50) truncados.add(id);
          d.forEach(x => linhas.set(id + ':' + x.Id, eventoLinha(id, x)));
        }
      };
      const fila = ids.slice();
      await Promise.all(Array.from({ length: Math.min(8, fila.length) }, async () => { while (fila.length) await um(fila.shift()); }));
      /* código do evento (656...) pelo nome; guardado entre chamadas */
      const nomes = [...new Set([...linhas.values()].map(l => l.Evento).filter(Boolean))].filter(n => !CODIGOS.has(n));
      const fn = nomes.slice();
      await Promise.all(Array.from({ length: Math.min(6, fn.length) }, async () => { while (fn.length) {
        const n = fn.shift();
        const r = await post('restauth/searchentity', { Depth: 50, Entity: 'Evento', Start: 1, Filters: [eventoFiltroNome(n)] }, h);
        tk = r.headers.get('token') || tk; rf = r.headers.get('refreshtoken') || rf;
        const c = eventoCodigo(n, r.data && r.data.Data);
        if (c) CODIGOS.set(n, c);
      } }));
      if (tk) res.setHeader('x-centi-token', tk);
      if (rf) res.setHeader('x-centi-refresh', rf);
      return send(res, 200, { Linhas: [...linhas.values()].map(l => Object.assign(l, { Codigo: CODIGOS.get(l.Evento) || '' })), Truncados: [...truncados] });
    }
    if (busca) {
      const b = await post('restauth/searchentity', { Depth: 50, Entity: 'SFuncionario', Start: 1, Filters: [filtroBusca] }, h)   // Depth é o tamanho da página (50 no máximo); a paginação do Centi não avança;
      const tb = b.headers.get('token'), rb = b.headers.get('refreshtoken');
      if (tb) res.setHeader('x-centi-token', tb);
      if (rb) res.setHeader('x-centi-refresh', rb);
      if (b.status === 401) return send(res, 401, { message: 'Sessão do Centi expirada.' });
      if (!b.data || b.data.Success === false) return send(res, 502, { message: (b.data && b.data.Message && b.data.Message[0]) || 'O Centi não respondeu à busca.' });
      return send(res, 200, { Data: buscaLinhas(b.data.Data) });
    }
    if (quadro) {
      /* quadro (Cubo funcionário reduzido): só ativos e só as colunas que a licença-prêmio usa */
      let q;
      for (const ref of referencias(mes, ano, 3)) {   // mesma regra: folha do mês ainda não processada -> mês anterior
        q = await post('restauth/operation', await tela('FP245', quadroPayload(ref.mes, ref.ano), h), Object.assign({}, h, { year: String(ref.ano), month: String(ref.mes) }));
        if (!semFolha(q)) break;
      }
      const t2 = q.headers.get('token'), r2 = q.headers.get('refreshtoken');
      if (t2) res.setHeader('x-centi-token', t2);
      if (r2) res.setHeader('x-centi-refresh', r2);
      const cq = q.data && q.data.Cube;
      if (!cq) return send(res, q.status === 401 ? 401 : 502, { message: (q.data && q.data.Message && q.data.Message[0]) || 'O Centi não devolveu o cubo de funcionários.' });
      return send(res, 200, { Pessoas: quadroLinhas(cq) });
    }
    if (ferias) {
      /* quadro de ativos (Cubo funcionário) + gozos de férias (Cubo movimentação férias); o direito é calculado na tela */
      const f1 = await post('restauth/operation', await tela('FP051', cuboPayload(mes, ano), h), h);
      const t1 = f1.headers.get('token'), r1 = f1.headers.get('refreshtoken');
      if (t1) res.setHeader('x-centi-token', t1);
      if (r1) res.setHeader('x-centi-refresh', r1);
      const c1 = f1.data && f1.data.Cube;
      if (!c1) return send(res, f1.status === 401 ? 401 : 502, { message: (f1.data && f1.data.Message && f1.data.Message[0]) || 'O Centi não devolveu o cubo de funcionários.' });
      const f2 = await post('restauth/operation', await tela('FP273', feriasPayload(), h), h);
      const c2 = f2.data && f2.data.Cube;
      if (!c2) return send(res, f2.status === 401 ? 401 : 502, { message: (f2.data && f2.data.Message && f2.data.Message[0]) || 'O Centi não devolveu o cubo de férias.' });
      const quadro = cuboLinhas(c1).map(p => ({ ID: p.ID, MATRICULA: p.MATRICULA, NOMEFUNC: p.NOMEFUNC, CARGO: p.CARGO, HIERARQUIA: p.HIERARQUIA,
        TIPOADMISSAO: p.TIPOADMISSAO, DATAADMISSAO: p.DATAADMISSAO, TIPOAFASTAMENTO: p.TIPOAFASTAMENTO }));
      return send(res, 200, { Pessoas: quadro, Gozos: feriasLinhas(c2) });
    }
    if (dados) {
      /* FP001 (funcionário) -> pessoa física; DM017 (pessoa física) -> CPF, nascimento, identidade e endereço */
      const carregar = async (codigo, padrao, key) => {
        const k = await chaveDaTela(codigo, padrao, h);
        if (k.falhou && sessaoInvalida(k.falhou)) { const e = new Error('Sessão do Centi expirada.'); e.expirou = true; throw e; }
        const r = await centiGet('restauth/load?entity=' + k.chave + '&key=' + encodeURIComponent(key), h);
        if (sessaoInvalida(r)) { const e = new Error('Sessão do Centi expirada.'); e.expirou = true; throw e; }
        const t = r.headers.get('token'), rf = r.headers.get('refreshtoken');
        if (t) res.setHeader('x-centi-token', t);
        if (rf) res.setHeader('x-centi-refresh', rf);
        return r.data;
      };
      const func = await carregar('FP001', 102744, idServidor);
      const idPessoa = idPessoaDoFuncionario(func);
      if (!idPessoa) return send(res, 502, { message: (func && func.Message && func.Message[0]) || 'O Centi não devolveu o cadastro deste servidor.' });
      const pessoa = await carregar('DM017', 103891, idPessoa);
      if (!pessoa || !pessoa.Entity) return send(res, 502, { message: (pessoa && pessoa.Message && pessoa.Message[0]) || 'O Centi não devolveu a pessoa física deste servidor.' });
      return send(res, 200, servidorDados(pessoa));
    }
    if (ficha) {
      /* acha as fichas (uma por folha) da matrícula na referência e carrega cada uma */
      const busca = await post('restauth/searchentity', { Depth: 50, Entity: 'SFichaFinanceiraPessoa', Start: 1,
        Filters: [{ FieldName: 'Matricula', List: false, Operation: 0, TypeFilter: 3, Value: matricula, between: '' }] }, h);
      const bt = busca.headers.get('token'), br = busca.headers.get('refreshtoken');
      if (bt) res.setHeader('x-centi-token', bt);
      if (br) res.setHeader('x-centi-refresh', br);
      if (busca.status === 401) return send(res, 401, { message: 'Sessão do Centi expirada.' });
      const achadas = ((busca.data && busca.data.Data) || []).filter(f => String(f.Matricula) === matricula).slice(0, 10);
      const fichas = [];
      for (const f of achadas) {
        const d = await post('restauth/postdata', { Id: String(f.Id), Method: 'folha.carregarfichafinanceira' }, h);
        if (d.data && d.data.Id) fichas.push(fichaResumo(d.data));
      }
      return send(res, 200, { Fichas: fichas });
    }
    const r = await post(cubo ? 'restauth/operation' : path, cubo ? await tela('FP051', cuboPayload(mes, ano), h) : (body || {}), h);
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
    if (e && e.expirou) return send(res, 401, { message: 'Sua sessão do Centi expirou. Entre novamente.' });
    if (e && e.centi) return send(res, 502, { message: e.message });
    return send(res, 502, { message: 'Não foi possível falar com o Centi.' });
  }
};
