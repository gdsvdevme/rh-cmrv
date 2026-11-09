/* Utilitários das funções que falam com o Centi. O prefixo "_" evita que a Vercel publique este arquivo como rota. */
const crypto = require('crypto');
const LZ = require('lz-string');

const BASE = (process.env.CENTI_BASE || 'https://go.centi.com.br/go02/wcf').replace(/\/+$/, '');
/* o Centi descobre o cliente (Câmara de Rio Verde) pelo Referer; um navegador não consegue enviá-lo, por isso tudo passa por aqui */
const REFERER = process.env.CENTI_REFERER || 'https://go.centi.com.br/camararioverde/';

const allowedUsers = () => (process.env.CENTI_ALLOWED_USERS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
/* "*" na lista libera qualquer usuário do Centi; os outros nomes ficam só como registro e voltam a valer se o "*" for retirado */
const allowAll = () => allowedUsers().includes('*');
const isAllowed = user => allowAll() || allowedUsers().includes(String(user || '').trim().toLowerCase());
/* nome da conta confirmado pelo próprio Centi (claim "User" do token que ele devolve no login), em vez do texto digitado */
const usuarioDoToken = jwt => {
  try {
    const c = JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8'));
    return String(c.User || c.unique_name || '').trim();
  } catch (e) { return ''; }
};
/* administradores do sistema (editam o painel dos mini sistemas); precisam estar em CENTI_ALLOWED_USERS também */
const adminUsers = () => (process.env.CENTI_ADMIN_USERS || '')
  .split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const isAdmin = user => adminUsers().includes(String(user || '').trim().toLowerCase());

async function centiPost(path, body, extra) {
  const r = await fetch(BASE + '/' + path, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json', referer: REFERER }, extra || {}),
    body: JSON.stringify(body)
  });
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data, headers: r.headers };
}

async function centiGet(path, extra) {
  const r = await fetch(BASE + '/' + path, { headers: Object.assign({ referer: REFERER }, extra || {}) });
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data, headers: r.headers };
}

/* O Centi renumera as telas (ModuleKey) quando se atualiza: em 04/11/2026, 669 das 814 telas mudaram de número e
   todo número fixo no código passou a abrir OUTRA tela (o relatório de afastamentos virou um que reclama da folha, e o cubo
   de funcionários dava erro 500). Por isso o número de cada tela é lido do menu do Centi (GET restauth/modules), pelo código
   da tela (FP071, FP051…). Os números fixos abaixo só valem se o menu não puder ser lido. */
const MODULOS_TTL = 30 * 60 * 1000;
let modulos = { em: 0, mapa: null };
function lerMenu(data) {
  const mapa = new Map();
  (function anda(lista) {
    (Array.isArray(lista) ? lista : []).forEach(x => {
      if (!x || typeof x !== 'object') return;
      if (x.Command && x.ModuleKey != null) mapa.set(String(x.Command), x.ModuleKey);
      anda(x.SubItems);
    });
  })(data && data.Value);
  return mapa;
}
/* h: cabeçalhos da pessoa (user, token, refreshtoken, Authorization). Devolve o resultado cru se a sessão for inválida,
   para a função responder 401. */
async function chaveDaTela(codigo, padrao, h) {
  if (!modulos.mapa || Date.now() - modulos.em > MODULOS_TTL) {
    const r = await centiGet('restauth/modules', h);
    const mapa = lerMenu(r.data);
    if (mapa.size) modulos = { em: Date.now(), mapa };
    else return { chave: padrao, falhou: r };   // menu ilegível: usa o número fixo e deixa quem chamou decidir
  }
  return { chave: modulos.mapa.has(codigo) ? modulos.mapa.get(codigo) : padrao };
}
const limparMenu = () => { modulos = { em: 0, mapa: null }; };

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

/* Cubo funcionário reduzido (FP245): vínculo, admissão e situação de todos, ativos e desligados. Só as colunas necessárias para a
   licença-prêmio: sem CPF, PIS, sexo nem outros dados pessoais. */
const QUADRO_MODULO = 120968;
const QUADRO_COLUNAS = ['MATRICULA', 'NOME', 'SITUACAO', 'TIPOADMISSAO', 'DATAADMISSAO', 'LOTACAO', 'CARGO', 'TIPOAFASTAMENTO', 'DATAAFASTAMENTO'];
const quadroPayload = (mes, ano) => ({
  ModuleKey: QUADRO_MODULO, Guid: crypto.randomUUID(),
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
const quadroLinhas = cube => cuboColunas(cube, QUADRO_COLUNAS, true);

/* Relação de afastamentos (FP071): o Centi só entrega em PDF. De 01/01/1990 até o fim do mês da referência, do órgão inteiro ou só de um servidor (Id do cadastro).
   O PDF vai como veio (gzip) e o navegador o lê com pdf.js. */
const AFASTAMENTOS_MODULO = 121058;
const afastamentosPayload = (mes, ano, funcionario, ref) => {
  /* o período vai até o fim do mês pedido; ref é o mês de referência da folha (mais antigo quando a folha do mês pedido ainda não foi processada) */
  const fim = new Date(Date.UTC(ano, mes, 0)).getUTCDate();   // último dia do mês pedido
  const mm = String(mes).padStart(2, '0');
  const rm = String((ref && ref.mes) || mes).padStart(2, '0'), ra = (ref && ref.ano) || ano;
  return {
    ModuleKey: AFASTAMENTOS_MODULO, Guid: crypto.randomUUID(),
    Params: [
      { Key: 'Orgaos', Value: vazio() }, { Key: 'Funcionarios', Value: funcionario ? { Params: [{ Key: 'Tag', Value: '0' }, { Key: 'Array', Value: [String(funcionario)] }] } : vazio() }, { Key: 'Lotacoes', Value: vazio() }, { Key: 'Cargos', Value: vazio() },
      { Key: 'TipoAfastamentos', Value: vazio() }, { Key: 'TipoAdmissao', Value: vazio() }, { Key: 'IdHierarquia', Value: vazio() },
      { Key: 'DataFin', Value: '01/' + rm + '/' + ra }, { Key: 'DataIn', Value: '01/01/1990:' + fim + '/' + mm + '/' + ano },
      { Key: 'BeneficiarioRPPS', Value: '0' }, { Key: 'Ordenacao', Value: '0' },
      { Key: 'EmbeddedFonts', Value: '0' }, { Key: 'ImprimirQrCodeGenerico', Value: '0' }, { Key: 'ChaveEletronica', Value: '' },
      { Key: 'TextoCentralizado', Value: '' }, { Key: 'MarcaDagua', Value: '0' }, { Key: 'ApenasPrimeiraPagina', Value: '0' },
      { Key: 'TamanhoTextoCentralizado', Value: '' }, { Key: 'PrintOptimized', Value: '0' }, { Key: 'ExportXlsxSimplificado', Value: '0' },
      { Key: 'RelatorioVerificacaoItem', Value: '' }, { Key: 'GerarCubo', Value: '0' }, { Key: 'CadastrarEValidarCubo', Value: '0' },
      { Key: 'TypeReturn', Value: '0' }, { Key: 'SendMail', Value: '0' }, { Key: 'EmailRemetente', Value: '' }, { Key: 'Remetente', Value: '' },
      { Key: 'Emails', Value: '' }, { Key: 'Assunto', Value: '' }, { Key: 'Msg', Value: '' }, { Key: 'Sign', Value: '0' }, { Key: 'IdAssinatura', Value: '' },
      { Key: 'FileName', Value: '' }, { Key: 'StorageReport', Value: '0' }, { Key: 'Name', Value: '' }, { Key: 'Description', Value: '' },
      { Key: 'SysInternal', Value: '0' }, { Key: 'RestApp', Value: '0' }, { Key: 'Token', Value: '' }, { Key: 'GuidTransacao', Value: '' },
      { Key: 'Captcha', Value: '' }, { Key: 'Background', Value: '0' }
    ]
  };
};

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

const umFuncionario = id => ({ Params: [{ Key: 'Tag', Value: '0' }, { Key: 'Array', Value: [String(id)] }] });
/* Espelho de ponto (FP170) de todo o órgão (ou de um servidor, se vier o Id). A referência (mês/ano) vai nos cabeçalhos da chamada, não aqui. */
const ESPELHO_MODULO = 121017;
const espelhoPayload = funcionario => ({
  ModuleKey: ESPELHO_MODULO, Guid: crypto.randomUUID(),
  Params: [
    { Key: 'Orgaos', Value: { Params: [{ Key: 'Tag', Value: '0' }, { Key: 'Array', Value: [process.env.CENTI_ORGAO || '1'] }] } },
    ...(funcionario ? [{ Key: 'Funcionarios', Value: umFuncionario(funcionario) }, { Key: 'Funcionario', Value: umFuncionario(funcionario) }] : []),   // só um servidor (Id do cadastro); a tela confere o PDF recebido
    { Key: 'Fechamentos', Value: vazio() }, { Key: 'Lotacao', Value: vazio() }, { Key: 'IdHierarquia', Value: vazio() },
    { Key: 'OrdenarPor', Value: '0' }, { Key: 'AgruparPorLotacao', Value: '0' }, { Key: 'AgregarPorNivel', Value: '0' }, { Key: 'IdNivel', Value: '' },
    { Key: 'EmbeddedFonts', Value: '0' }, { Key: 'ImprimirQrCodeGenerico', Value: '0' }, { Key: 'ChaveEletronica', Value: '' },
    { Key: 'TextoCentralizado', Value: '' }, { Key: 'MarcaDagua', Value: '0' }, { Key: 'ApenasPrimeiraPagina', Value: '0' },
    { Key: 'TamanhoTextoCentralizado', Value: '' }, { Key: 'PrintOptimized', Value: '0' }, { Key: 'ExportXlsxSimplificado', Value: '0' },
    { Key: 'RelatorioVerificacaoItem', Value: '' }, { Key: 'GerarCubo', Value: '0' }, { Key: 'CadastrarEValidarCubo', Value: '0' },
    { Key: 'TypeReturn', Value: '0' }, { Key: 'SendMail', Value: '0' }, { Key: 'EmailRemetente', Value: '' }, { Key: 'Remetente', Value: '' },
    { Key: 'Emails', Value: '' }, { Key: 'Assunto', Value: '' }, { Key: 'Msg', Value: '' }, { Key: 'Sign', Value: '0' }, { Key: 'IdAssinatura', Value: '' },
    { Key: 'FileName', Value: '' }, { Key: 'StorageReport', Value: '0' }, { Key: 'Name', Value: '' }, { Key: 'Description', Value: '' },
    { Key: 'SysInternal', Value: '0' }, { Key: 'RestApp', Value: '0' }, { Key: 'Token', Value: '' }, { Key: 'GuidTransacao', Value: '' },
    { Key: 'Captcha', Value: '' }, { Key: 'Background', Value: '0' }
  ]
});

module.exports = { allowAll, usuarioDoToken, centiGet, chaveDaTela, limparMenu, lerMenu, quadroPayload, quadroLinhas, afastamentosPayload, isAdmin, adminUsers, espelhoPayload, BASE, centiPost, cuboPayload, cuboLinhas, feriasPayload, feriasLinhas, fichaResumo, centiLogin, isAllowed, allowedUsers, pbPassword, readBody, send };

/* Busca de servidor para a licença-prêmio: só o que a tela usa do cadastro (sem CPF, nascimento e dados de integração).
   Número = matrícula exata; texto = nome contendo o termo. No máximo 50 resultados. */
const BUSCA_CAMPOS = ['Id', 'Matricula', 'Nome', 'DataAdmissao', 'Situacao', 'TipoAdm', 'Cargo', 'Lotacao'];
function buscaFiltro(termo) {
  const t = String(termo || '').trim().replace(/[%_]/g, '');
  if (/^\d{3,12}$/.test(t)) return { FieldName: 'Matricula', List: false, Operation: 0, TypeFilter: 3, Value: t, between: '' };
  if (t.length >= 3 && t.length <= 60) return { FieldName: 'Nome', List: false, Operation: 6, TypeFilter: 0, Value: '%' + t.toUpperCase() + '%', between: '' };
  return null;
}
/* quem está ativo vem primeiro, depois por nome */
const buscaLinhas = data => (data || []).slice(0, 50).map(f => { const o = {}; BUSCA_CAMPOS.forEach(k => { o[k] = f[k] == null ? '' : String(f[k]); }); return o; })
  .sort((a, b) => (/^ativo$/i.test(b.Situacao) - /^ativo$/i.test(a.Situacao)) || a.Nome.localeCompare(b.Nome, 'pt-BR'));
module.exports.buscaFiltro = buscaFiltro;
module.exports.buscaLinhas = buscaLinhas;

/* Dados pessoais de UM servidor para os documentos (declaração de conta, portarias): lidos dos cadastros do Centi
   FP001 (Funcionário, que aponta a pessoa) e DM017 (Pessoa física: CPF, nascimento, RG e endereço).
   Só é chamado quando a pessoa escolhe o servidor; nada é guardado. As telas carregam um registro por
   GET restauth/load?entity=<ModuleKey>&key=<Id>, e o registro vem como {Entity:{Fields:[{Key,Value}]}}. */
const campos = e => { const o = {}; ((e && e.Entity && e.Entity.Fields) || []).forEach(f => { o[f.Key] = f.Value; }); return o; };
/* campo que aponta outro cadastro: {Fields:[{Key:'Id',Value:..},{Key:'Display',Value:..}]} */
const refCampo = v => { const o = {}; ((v && v.Fields) || []).forEach(f => { o[f.Key] = f.Value; }); return o; };
const txt = v => (v == null || typeof v === 'object') ? '' : String(v).trim();
const mascaraCpf = v => { const d = txt(v).replace(/\D/g, ''); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : txt(v); };
const mascaraCep = v => { const d = txt(v).replace(/\D/g, ''); return d.length === 8 ? d.replace(/(\d{2})(\d{3})(\d{3})/, '$1.$2-$3') : ''; };
const campos2 = lista => { const o = {}; ((lista && lista.Fields) || []).forEach(f => { o[f.Key] = f.Value; }); return o; };
/* "Rua 5, 120, Quadra 3, Lote 7, Compl., Bairro, Rio Verde - GO, CEP 75.900-000" */
function montarEndereco(lista) {
  const reg = (lista || []).map(campos2);
  const e = reg.find(x => Number(x.Principal) === 1) || reg[0];
  if (!e) return '';
  const tipo = txt(refCampo(e.IdTipoLogradouro).Display), logr = txt(e.Logradouro);
  /* o tipo (ex.: "Área") só entra se o logradouro ainda não começar por uma palavra de tipo (ex.: "RUA 17, 231") */
  const jaTemTipo = /^(rua|av\.?|avenida|alameda|al\.?|travessa|tv\.?|pra[çc]a|rodovia|rod\.?|estrada|beco|via|vila|largo|parque|setor|quadra|[áa]rea)(\s|$)/i;
  const rua = !tipo || jaTemTipo.test(logr) || logr.toLowerCase().startsWith(tipo.toLowerCase()) ? logr : (tipo + ' ' + logr).trim();
  const numero = txt(e.Numero);
  const partes = [rua];
  if (numero && numero !== '0' && !new RegExp('(^|[\\s,])' + numero.replace(/\W/g, '') + '$').test(rua)) partes.push('nº ' + numero);
  if (txt(e.Quadra) && txt(e.Quadra) !== '0') partes.push('Quadra ' + txt(e.Quadra));
  if (txt(e.Lote) && txt(e.Lote) !== '0') partes.push('Lote ' + txt(e.Lote));
  partes.push(txt(e.Complemento), txt(e.Bairro), txt(refCampo(e.IdCidade).Display).replace(/,\s*/, ' - '));
  const cep = mascaraCep(e.Cep);
  if (cep) partes.push('CEP ' + cep);
  return partes.filter(Boolean).join(', ');
}
/* Identidade como "1234567 SSP/GO" */
function montarIdentidade(doc) {
  const rg = txt(doc.RG), org = txt(doc.OrgaoExpeditor), uf = txt(doc.UFExpeditor);
  if (!rg) return '';
  return rg + (org ? ' ' + org + (uf ? '/' + uf : '') : (uf ? ' ' + uf : ''));
}
function servidorDados(pessoa) {
  const c = campos(pessoa), doc = campos2(c.PessoaFuncionarioDocumentos);
  return { Nome: txt(c.Nome), Cpf: mascaraCpf(c.Cpf), DataNascimento: txt(c.DataNascimento).slice(0, 10), Identidade: montarIdentidade(doc), Endereco: montarEndereco(c.Endereco) };
}
/* Id da pessoa física a partir do registro do funcionário (FP001) */
const idPessoaDoFuncionario = func => { const id = refCampo(campos(func).IdPessoaFisica).Id; return /^\d{1,12}$/.test(String(id == null ? '' : id)) ? String(id) : ''; };
module.exports.servidorDados = servidorDados;
module.exports.idPessoaDoFuncionario = idPessoaDoFuncionario;
