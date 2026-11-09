/* Teste de fumaça das páginas geradas em site/ (Playwright; não faz parte do `npm test`).
   Para cada página: abre sem servidor (banco simulado), registra erros de console e os valores de TODAS as variáveis CSS
   nos temas claro e escuro. Serve para provar que uma refatoração não mudou nada.
     node tests/smoke/smoke.js grava  /tmp/smoke-antes.json     (antes da mudança)
     node tests/smoke/smoke.js compara /tmp/smoke-antes.json     (depois: acusa qualquer diferença)  */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const raiz = path.resolve(__dirname, '../..');
const PAGINAS = ['index.html', 'fluxogramas/index.html', 'pessoal/index.html', 'ponto/index.html', 'ferias/index.html',
  'licenca-premio/index.html', 'tarefas/index.html', 'carimbos/index.html', 'documentos/index.html'];

const bancoFalso = () => {
  const mem = {};
  window.claude = { use: async () => ({ doc: k => ({ get: async () => ({ exists: k in mem, data: () => mem[k] }), set: async v => { mem[k] = v; }, delete: async () => {} }),
    collection: () => ({ orderBy() { return this; }, limit() { return this; }, get: async () => ({ docs: [] }) }) }) };
};
async function coleta(browser, pagina) {
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const erros = [];
  p.on('pageerror', e => erros.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|ERR_FAILED/.test(m.text())) erros.push('console: ' + m.text()); });
  await p.addInitScript(bancoFalso);
  await p.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await p.goto('file://' + path.join(raiz, 'site', pagina));
  await p.waitForTimeout(1800);
  const vars = await p.evaluate(() => {
    const nomes = new Set();
    for (const ss of document.styleSheets) { let rs; try { rs = ss.cssRules; } catch (e) { continue; } const anda = rs => { for (const r of rs) { if (r.style) for (const n of r.style) if (n.startsWith('--')) nomes.add(n); if (r.cssRules) anda(r.cssRules); } }; anda(rs); }
    const out = {};
    for (const tema of ['light', 'dark']) {
      document.documentElement.setAttribute('data-theme', tema);
      const cs = getComputedStyle(document.documentElement);
      out[tema] = Object.fromEntries([...nomes].sort().map(n => [n, cs.getPropertyValue(n).trim()]));
      out[tema]['color-scheme'] = cs.colorScheme;
    }
    return out;
  });
  const titulo = await p.title();
  await p.close();
  return { titulo, erros, vars };
}
(async () => {
  const [modo, arq] = process.argv.slice(2);
  const b = await chromium.launch();
  const res = {};
  for (const pg of PAGINAS) res[pg] = await coleta(b, pg);
  await b.close();
  if (modo === 'grava') { fs.writeFileSync(arq || '/tmp/smoke-antes.json', JSON.stringify(res, null, 1)); console.log('Gravado:', Object.keys(res).length, 'páginas'); return; }
  if (modo === 'compara') {
    const antes = JSON.parse(fs.readFileSync(arq, 'utf8')); let ruim = 0;
    for (const pg of PAGINAS) {
      const a = antes[pg], d = res[pg], dif = [];
      if (a.titulo !== d.titulo) dif.push('título: ' + a.titulo + ' → ' + d.titulo);
      if (JSON.stringify(a.erros) !== JSON.stringify(d.erros)) dif.push('erros: ' + JSON.stringify(a.erros) + ' → ' + JSON.stringify(d.erros));
      for (const t of ['light', 'dark']) { const ks = new Set([...Object.keys(a.vars[t]), ...Object.keys(d.vars[t])]); for (const k of ks) if (a.vars[t][k] !== d.vars[t][k]) dif.push(t + ' ' + k + ': ' + a.vars[t][k] + ' → ' + d.vars[t][k]); }
      console.log((dif.length ? 'DIFERE ' : 'igual  ') + pg + (d.erros.length ? '  (erros de console: ' + d.erros.length + ')' : ''));
      dif.slice(0, 12).forEach(x => console.log('    ' + x)); if (dif.length) ruim++;
    }
    process.exit(ruim ? 1 : 0);
  }
  for (const pg of PAGINAS) console.log(pg, '→ erros:', res[pg].erros.length, '| vars:', Object.keys(res[pg].vars.light).length, res[pg].erros.slice(0, 2));
})();
