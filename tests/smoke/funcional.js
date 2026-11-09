/* Conferência de comportamento das páginas geradas (Playwright; fora do `npm test`): botão de tema, aviso rápido e tela de
   carregamento em cada página. Complementa smoke.js (que só vê erros de console e variáveis de cor). */
const { chromium } = require('playwright');
const path = require('path');
const SITE = process.env.SITE_DIR || path.resolve(__dirname, '../../site');
const PAGINAS = ['index.html', 'fluxogramas/index.html', 'pessoal/index.html', 'ponto/index.html', 'ferias/index.html', 'licenca-premio/index.html', 'tarefas/index.html', 'carimbos/index.html', 'documentos/index.html'];
(async () => {
  const b = await chromium.launch(); let ruim = 0;
  for (const pg of PAGINAS) {
    const p = await b.newPage(); const erros = [];
    p.on('pageerror', e => erros.push(e.message));
    await p.addInitScript(() => { const mem = {}; window.claude = { use: async () => ({ doc: k => ({ get: async () => ({ exists: k in mem, data: () => mem[k] }), set: async v => { mem[k] = v; }, delete: async () => {} }), collection: () => ({ orderBy() { return this; }, limit() { return this; }, get: async () => ({ docs: [] }) }) }) }; });
    await p.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    await p.goto('file://' + path.join(SITE, pg)); await p.waitForTimeout(1500);
    const r = await p.evaluate(() => {
      const o = {}, btn = document.querySelector('#themeBtn'), raiz = document.documentElement;
      o.temaInicial = raiz.getAttribute('data-theme');
      if (btn) { const t0 = btn.textContent.trim(); btn.click(); o.temaDepois = raiz.getAttribute('data-theme'); o.textoMudou = btn.textContent.trim() !== t0; o.aria = btn.getAttribute('aria-label'); btn.click(); o.voltou = raiz.getAttribute('data-theme') === o.temaInicial; }
      else o.semBotao = true;
      o.guardado = (() => { try { return localStorage.getItem('rhcrv-tema'); } catch (e) { return 'x'; } })();
      if (typeof toast === 'function' && document.querySelector('#toast')) { toast('ola'); o.toast = !document.querySelector('#toast').hidden && document.querySelector('#toast').textContent.startsWith('ola'); }
      else o.semToast = true;
      return o;
    });
    console.log(pg.padEnd(26), JSON.stringify(r), erros.length ? 'ERROS: ' + erros.join(' | ') : '');
    if (erros.length) ruim++;
    await p.close();
  }
  await b.close(); process.exit(ruim ? 1 : 0);
})();
