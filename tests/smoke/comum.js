/* Partes comuns dos testes de fumaça (smoke.js e funcional.js). */
const path = require('path');
const raiz = path.resolve(__dirname, '../..');
const SITE = process.env.SITE_DIR || path.join(raiz, 'site');      // SITE_DIR=/outra/copia/site compara outra versão
const PAGINAS = ['index.html', 'fluxogramas/index.html', 'pessoal/index.html', 'ponto/index.html', 'ferias/index.html',
  'licenca-premio/index.html', 'sentencas/index.html', 'tarefas/index.html', 'espelho/index.html', 'documentos/index.html'];

/* roda dentro da página: um banco de documentos em memória no lugar do servidor */
const bancoFalso = () => {
  const mem = {};
  window.claude = { use: async () => ({ doc: k => ({ get: async () => ({ exists: k in mem, data: () => mem[k] }), set: async v => { mem[k] = v; }, delete: async () => {} }),
    collection: () => ({ orderBy() { return this; }, limit() { return this; }, get: async () => ({ docs: [] }) }) }) };
};

/* abre uma página de site/ sem rede, com o banco falso; devolve { p, erros } (erros de JavaScript e de console) */
async function abrir(browser, pagina) {
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const erros = [];
  p.on('pageerror', e => erros.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|ERR_FAILED/.test(m.text())) erros.push('console: ' + m.text()); });
  await p.addInitScript(bancoFalso);
  await p.emulateMedia({ colorScheme: 'light' });
  await p.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await p.goto('file://' + path.join(SITE, pagina));
  await p.waitForTimeout(1800);
  return { p, erros };
}
module.exports = { SITE, PAGINAS, abrir };
