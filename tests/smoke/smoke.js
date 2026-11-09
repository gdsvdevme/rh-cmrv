/* Teste de fumaça das páginas geradas em site/ (Playwright; não faz parte do `npm test`).
   Para cada página: abre sem servidor (banco simulado), registra erros de console e os valores de TODAS as variáveis CSS
   nos temas claro, escuro e escuro pela preferência do sistema. Serve para provar que uma refatoração não mudou nada.
     node tests/smoke/smoke.js grava /tmp/smoke-antes.json      (antes da mudança)
     node tests/smoke/smoke.js compara /tmp/smoke-antes.json    (depois: acusa qualquer diferença)  */
const { chromium } = require('playwright');
const fs = require('fs');
const { PAGINAS, abrir } = require('./comum');

/* roda dentro da página: lê todas as variáveis CSS (nomes achados nas folhas de estilo) e o color-scheme do tema pedido.
   tema = 'light' | 'dark' (atributo data-theme) ou null (sem atributo: vale a preferência do sistema) */
const lerVars = tema => {
  const nomes = new Set();
  const anda = rs => { for (const r of rs) { if (r.style) for (const n of r.style) if (n.startsWith('--')) nomes.add(n); if (r.cssRules) anda(r.cssRules); } };
  for (const ss of document.styleSheets) { try { anda(ss.cssRules); } catch (e) { /* folha de outro domínio */ } }
  if (tema) document.documentElement.setAttribute('data-theme', tema); else document.documentElement.removeAttribute('data-theme');
  const cs = getComputedStyle(document.documentElement);
  const out = Object.fromEntries([...nomes].sort().map(n => [n, cs.getPropertyValue(n).trim()]));
  out['color-scheme'] = cs.colorScheme;
  return out;
};
async function coleta(browser, pagina) {
  const { p, erros } = await abrir(browser, pagina);
  const vars = { light: await p.evaluate(lerVars, 'light'), dark: await p.evaluate(lerVars, 'dark') };
  await p.emulateMedia({ colorScheme: 'dark' });
  vars['media-dark'] = await p.evaluate(lerVars, null);
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
      for (const t of ['light', 'dark', 'media-dark']) {
        const ks = new Set([...Object.keys(a.vars[t]), ...Object.keys(d.vars[t])]);
        for (const k of ks) if (a.vars[t][k] !== d.vars[t][k]) dif.push(t + ' ' + k + ': ' + a.vars[t][k] + ' → ' + d.vars[t][k]);
      }
      console.log((dif.length ? 'DIFERE ' : 'igual  ') + pg + (d.erros.length ? '  (erros de console: ' + d.erros.length + ')' : ''));
      dif.slice(0, 12).forEach(x => console.log('    ' + x)); if (dif.length) ruim++;
    }
    process.exit(ruim ? 1 : 0);
  }
  for (const pg of PAGINAS) console.log(pg, '→ erros:', res[pg].erros.length, '| vars:', Object.keys(res[pg].vars.light).length, res[pg].erros.slice(0, 2));
})();
