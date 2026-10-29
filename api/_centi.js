/* Utilitários das funções que falam com o Centi. O prefixo "_" evita que a Vercel publique este arquivo como rota. */
const crypto = require('crypto');
const LZ = require('lz-string');

const BASE = (process.env.CENTI_BASE || 'https://go.centi.com.br/go02/wcf').replace(/\/+$/, '');
/* o Centi descobre o cliente (Câmara de Rio Verde) pelo Referer; um navegador não consegue enviá-lo, por isso tudo passa por aqui */
const REFERER = process.env.CENTI_REFERER || 'https://go.centi.com.br/camararioverde/';

const allowedUsers = () => (process.env.CENTI_ALLOWED_USERS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const isAllowed = user => allowedUsers().includes(String(user || '').trim().toLowerCase());

async function centiPost(path, body, extra) {
  const r = await fetch(BASE + '/' + path, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json', referer: REFERER }, extra || {}),
    body: JSON.stringify(body)
  });
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data, headers: r.headers };
}

const centiLogin = (user, pass) =>
  centiPost('rest/login', { User: user, Pass: LZ.compressToBase64(pass), Encrypted: true, TypeRequest: 0, FrontBeta: true });

/* senha da conta no PocketBase: derivada do usuário e de um segredo do servidor, sem nunca mudar.
   Assim cada pessoa pode entrar em vários aparelhos sem derrubar a sessão das outras. */
const pbPassword = user => crypto.createHmac('sha256', process.env.APP_SECRET || '')
  .update('rhcmrv:' + user).digest('base64url');

function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  return b && typeof b === 'object' ? b : {};
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

/* Cubo funcionário (FP051): é o que o Centi usa na tela de mesmo nome. Devolve só os ativos da referência pedida e só
   as colunas que o sistema usa (sem CPF, endereço, dados bancários etc.). */
const CUBO_MODULO = 120965;
const CUBO_COLUNAS = ['ID', 'MATRICULA', 'NOMEFUNC', 'CARGO', 'CLASSENIVEL', 'FUNCAO', 'HIERARQUIA', 'LOTACAO', 'TIPOADMISSAO',
  'SITUACAO', 'TIPOAFASTAMENTO', 'DATAADMISSAO', 'EMAIL', 'TELEFONES', 'SALARIO'];
const vazio = () => ({ Params: [{ Key: 'Tag', Value: '0' }, { Key: 'Array', Value: [] }] });
const cuboPayload = (mes, ano) => ({
  ModuleKey: CUBO_MODULO, Guid: crypto.randomUUID(),
  Params: [
    { Key: 'Orgaos', Value: vazio() }, { Key: 'Funcionario', Value: vazio() }, { Key: 'FiltroFuncionarios', Value: '0' },
    { Key: 'Cargos', Value: vazio() }, { Key: 'ClassesNeiveis', Value: vazio() }, { Key: 'Funcao', Value: vazio() },
    { Key: 'IdLotacao', Value: vazio() }, { Key: 'DataRef', Value: '01/' + String(mes).padStart(2, '0') + '/' + ano },
    { Key: 'TiposAdmissao', Value: vazio() }, { Key: 'IdHierarquia', Value: vazio() }, { Key: 'Situacao', Value: '0' },
    { Key: 'Biometria', Value: '0' }, { Key: 'TagFuncionario', Value: '' }, { Key: 'Cube', Value: '' }, { Key: 'CubeExcel', Value: '' },
    { Key: 'QuebrarTexto', Value: '0' }, { Key: 'TipoCuboProcessamento', Value: '0' }, { Key: 'NumberOfDecimalPlaces', Value: '0' },
    { Key: 'Name', Value: '' }, { Key: 'Description', Value: '' }, { Key: 'SysInternal', Value: '0' }, { Key: 'RestApp', Value: '0' },
    { Key: 'Token', Value: '' }, { Key: 'GuidTransacao', Value: '' }, { Key: 'Captcha', Value: '' }, { Key: 'Background', Value: '0' }
  ]
});
/* resposta do Centi -> [{COLUNA: valor}] só com as colunas pedidas; soAtivos mantém só SITUACAO = Ativo */
function cuboColunas(cube, colunas, soAtivos) {
  const nomes = (cube.Columns || []).map(c => c.Name);
  const ix = {}; colunas.forEach(n => { ix[n] = nomes.indexOf(n); });
  const val = z => (z && typeof z === 'object' ? z.Value : z);
  const out = [];
  (cube.Rows || []).forEach(r => {
    const v = r.Values || [];
    const o = {}; colunas.forEach(n => { const x = ix[n] < 0 ? '' : val(v[ix[n]]); o[n] = x == null ? '' : x; });
    if (!soAtivos || String(o.SITUACAO).trim().toLowerCase() === 'ativo') out.push(o);
  });
  return out;
}
const cuboLinhas = cube => cuboColunas(cube, CUBO_COLUNAS, true);

/* Cubo movimentação férias (FP273): uma linha por gozo, com o período aquisitivo a que pertence (só ativos) */
const FERIAS_MODULO = 120972;
const FERIAS_COLUNAS = ['MATRICULA', 'DTAQUIINI', 'DTAQUIFIN', 'SALDO', 'REINICIADO', 'CANCELADO', 'GOZOINICIAL', 'GOZOFINAL'];
const feriasPayload = () => ({
  ModuleKey: FERIAS_MODULO, Guid: crypto.randomUUID(),
  Params: [
    { Key: 'Orgaos', Value: vazio() }, { Key: 'Funcionarios', Value: vazio() }, { Key: 'Lotacoes', Value: vazio() }, { Key: 'Cargos', Value: vazio() },
    { Key: 'SomenteFeriasComReinicioDePeriodo', Value: '0' }, { Key: 'SomenteFeriasNaReferencia', Value: '0' },
    { Key: 'Situacao', Value: '1' }, { Key: 'TipoCadastro', Value: '0' },
    { Key: 'Cube', Value: '' }, { Key: 'CubeExcel', Value: '' }, { Key: 'QuebrarTexto', Value: '0' }, { Key: 'TipoCuboProcessamento', Value: '0' },
    { Key: 'NumberOfDecimalPlaces', Value: '0' }, { Key: 'Name', Value: '' }, { Key: 'Description', Value: '' }, { Key: 'SysInternal', Value: '0' },
    { Key: 'RestApp', Value: '0' }, { Key: 'Token', Value: '' }, { Key: 'GuidTransacao', Value: '' }, { Key: 'Captcha', Value: '' }, { Key: 'Background', Value: '0' }
  ]
});
const feriasLinhas = cube => cuboColunas(cube, FERIAS_COLUNAS, false);

/* Ficha financeira (FP024): uma ficha por folha (mensal, 13º…) do funcionário na referência. Só os dados que a tela mostra:
   sem CPF, sem apontamentos e sem o histórico de processamento. */
const num = x => (typeof x === 'number' ? x : Number(x) || 0);
function fichaResumo(f) {
  return {
    Id: f.Id, Folha: f.Folha, Mes: f.Mes, Ano: f.Ano, DataPagamento: f.DataPagamento || '',
    TotalProventos: num(f.TotalProventos), TotalDescontos: num(f.TotalDescontos), LiquidoReceber: num(f.LiquidoReceber),
    Eventos: (f.Eventos || []).map(e => ({ Id: e.Id, Nome: e.Nome, BaseCalc: num(e.BaseCalc), Referencia: num(e.Referencia),
      Provento: num(e.Provento), Desconto: num(e.Desconto), Tipo: e.TipoCalculo || '' }))
  };
}

module.exports = { BASE, centiPost, cuboPayload, cuboLinhas, feriasPayload, feriasLinhas, fichaResumo, centiLogin, isAllowed, allowedUsers, pbPassword, readBody, send };
