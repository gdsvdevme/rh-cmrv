/* Conferência de comportamento das páginas geradas (Playwright; fora do `npm test`): botão de tema, aviso rápido e erros de
   JavaScript em cada página. Complementa smoke.js (que só vê erros de console e variáveis de cor). Sai com erro se algo falhar. */
const { chromium } = require('playwright');
const { PAGINAS, abrir } = require('./comum');
(async () => {
  const b = await chromium.launch(); let ruim = 0;
  for (const pg of PAGINAS) {
    const { p, erros } = await abrir(b, pg);
    const r = await p.evaluate(() => {
      const o = {}, btn = document.querySelector('#themeBtn'), raiz = document.documentElement;
      o.temaInicial = raiz.getAttribute('data-theme');
      if (btn) { btn.click(); o.temaDepois = raiz.getAttribute('data-theme'); o.aria = btn.getAttribute('aria-label'); btn.click(); o.voltou = raiz.getAttribute('data-theme') === o.temaInicial; }
      if (typeof toast === 'function' && document.querySelector('#toast')) { toast('ola'); o.toast = !document.querySelector('#toast').hidden && document.querySelector('#toast').textContent.startsWith('ola'); }
      return o;
    });
    const falhas = [];
    if (erros.length) falhas.push('erros: ' + erros.join(' | '));
    if ('temaDepois' in r && (r.temaDepois === r.temaInicial || !r.voltou)) falhas.push('o botão de tema não alterna');
    if ('toast' in r && !r.toast) falhas.push('o aviso (toast) não aparece');
    console.log((falhas.length ? 'FALHA ' : 'ok    ') + pg.padEnd(26), JSON.stringify(r), falhas.join(' ; '));
    if (falhas.length) ruim++;
    await p.close();
  }
  await b.close(); process.exit(ruim ? 1 : 0);
})();
