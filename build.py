#!/usr/bin/env python3
"""Gera o site e os fragmentos para publicação.

  site/index.html               painel "Sistema Interno" (página inicial)
  site/fluxogramas/index.html   sistema de fluxogramas e manual
  site/pessoal/index.html       hierarquia de pessoal (importa planilha CSV)
  site/ponto/index.html         ponto de servidores externos (simulação)
  site/ferias/index.html        férias: quem está de férias e quem tem direito (período aquisitivo)
  site/licenca-premio/index.html licença-prêmio: períodos aquisitivos, prazos de gozo e controle dos efetivos (Estatuto, arts. 194 a 197)
  site/tarefas/index.html       tarefas do RH: checklist em quadro (kanban), equipe ou privadas
  site/carimbos/index.html      carimbos em PDF: posiciona o carimbo nas páginas e organiza por hierarquia
  site/documentos/index.html    gerador de documentos: abertura de conta (e, no futuro, portarias e decretos) no papel timbrado, em Word e PDF
  dist/artifact-*.html          fragmentos para publicar como artefato

Uso: python3 build.py [--flow-url URL] [--home-url URL]
  --flow-url  endereço do sistema de fluxogramas usado no painel (artefato)
  --home-url  endereço do painel usado no botão "Sistema Interno do RH" (artefato)
  --pb-url  endereço do PocketBase (padrão: https://pb.devgabriel.app.br)
  --centi-url  endereço do site que hospeda as funções /api/centi-login e /api/centi (padrão: o próprio site;
               só é preciso informar em fragmentos de artefato, que ficam em outro endereço)
  --ponto-url  endereço do Ponto – Servidores Externos usado no painel (artefato)
  --pessoal-url  endereço da Hierarquia de Pessoal usado no painel (artefato)
  --ferias-url  endereço do sistema de Férias usado no painel (artefato)
  --licenca-url  endereço do sistema de Licença-prêmio usado no painel (artefato)
  --tarefas-url  endereço do sistema de Tarefas usado no painel (artefato)
  --carimbos-url  endereço do sistema de Carimbos usado no painel (artefato)
  --documentos-url  endereço do Gerador de Documentos usado no painel (artefato)
"""
import glob, os, sys
root = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
rd = lambda p: open(os.path.join(root, p), encoding='utf-8').read()
GERADO = '<!-- ARQUIVO GERADO por build.py a partir de src/. Não edite aqui: altere src/ e rode `python3 build.py`. -->\n'
def wr(p, s):
    p = os.path.join(root, p); os.makedirs(os.path.dirname(p), exist_ok=True)
    if s.startswith('<!doctype html>\n'):            # site/: o aviso vem logo depois do doctype (sem mudar o modo de renderização)
        s = '<!doctype html>\n' + GERADO + s[len('<!doctype html>\n'):]
    else:                                            # dist/ (fragmentos de artefato)
        s = GERADO + s
    open(p, 'w', encoding='utf-8').write(s)

hello = rd('src/hello.js'); mcss = rd('src/modern.css'); mflow = rd('src/modern-flow.css')
mod = lambda t: t.replace('/*MODERN_CSS*/', mcss).replace('/*MODERN_FLOW_CSS*/', mflow).replace('/*HELLO_JS*/', hello)
css = rd('src/styles.css')
js = '\n'.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(os.path.join(root, 'src/js/*.js'))))
js = js.replace('/*VOLUME_CSS*/', rd('src/volume.css').replace('`', '\\`'))
pbjs = rd('src/pb.js').replace('/*PB_URL*/', opt('--pb-url', 'https://pb.devgabriel.app.br')).replace('/*CENTI_URL*/', opt('--centi-url', ''))
js = js.replace('</script>', '<\\/script>')
flow = mod(rd('src/index.template.html')).replace('/*CSS*/', css).replace('/*PB_JS*/', pbjs).replace('/*JS*/', js)
launcher = rd('src/launcher.template.html').replace('/*PB_JS*/', pbjs)
pessoal = mod(rd('src/pessoal.template.html')).replace('/*PB_JS*/', pbjs)
ponto = mod(rd('src/ponto.template.html'))
ferias = mod(rd('src/ferias.template.html')).replace('/*PB_JS*/', pbjs)
tarefas = mod(rd('src/tarefas.template.html')).replace('/*PB_JS*/', pbjs)
licenca = mod(rd('src/licenca.template.html')).replace('/*PB_JS*/', pbjs).replace('/*ENGINE_JS*/', rd('src/licenca-engine.js').replace('</script>', '<\\/script>'))
import base64
stamp = base64.b64encode(open(os.path.join(root, 'src/carimbo-padrao.png'), 'rb').read()).decode()
carimbos = mod(rd('src/carimbos.template.html')).replace('/*PB_JS*/', pbjs).replace('/*STAMP_B64*/', stamp)

documentos = mod(rd('src/documentos.template.html')).replace('/*PB_JS*/', pbjs).replace('/*EXTENSO_JS*/', rd('src/extenso.js').replace('</script>', '<\\/script>')).replace('/*TIMBRADO_B64*/', base64.b64encode(open(os.path.join(root, 'src/timbrado.docx'), 'rb').read()).decode())

head = ('<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head>'
        '<body style="margin:0">\n')
page = lambda frag: head + frag + '\n</body></html>\n'

# site (hospedagem comum, ex.: Vercel)
wr('site/index.html', page(launcher.replace('/*FLOW_URL*/', 'fluxogramas/').replace('/*PESSOAL_URL*/', 'pessoal/').replace('/*PONTO_URL*/', 'ponto/').replace('/*FERIAS_URL*/', 'ferias/').replace('/*LICENCA_URL*/', 'licenca-premio/').replace('/*TAREFAS_URL*/', 'tarefas/').replace('/*CARIMBOS_URL*/', 'carimbos/').replace('/*DOCUMENTOS_URL*/', 'documentos/')))
wr('site/documentos/index.html', page(documentos.replace('/*HOME_URL*/', '../')))
wr('site/carimbos/index.html', page(carimbos.replace('/*HOME_URL*/', '../')))
wr('site/ferias/index.html', page(ferias.replace('/*HOME_URL*/', '../')))
wr('site/licenca-premio/index.html', page(licenca.replace('/*HOME_URL*/', '../')))
wr('site/tarefas/index.html', page(tarefas.replace('/*HOME_URL*/', '../')))
wr('site/ponto/index.html', page(ponto.replace('/*HOME_URL*/', '../')))
wr('site/pessoal/index.html', page(pessoal.replace('/*HOME_URL*/', '../')))
wr('site/fluxogramas/index.html', page(flow.replace('/*HOME_URL*/', '../')))
# fragmentos de artefato
wr('dist/artifact-launcher.html', launcher.replace('/*FLOW_URL*/', opt('--flow-url', 'fluxogramas/')).replace('/*PESSOAL_URL*/', opt('--pessoal-url', 'pessoal/')).replace('/*PONTO_URL*/', opt('--ponto-url', 'ponto/')).replace('/*FERIAS_URL*/', opt('--ferias-url', 'ferias/')).replace('/*LICENCA_URL*/', opt('--licenca-url', 'licenca-premio/')).replace('/*TAREFAS_URL*/', opt('--tarefas-url', 'tarefas/')).replace('/*CARIMBOS_URL*/', opt('--carimbos-url', 'carimbos/')).replace('/*DOCUMENTOS_URL*/', opt('--documentos-url', 'documentos/')))
wr('dist/artifact-documentos.html', documentos.replace('/*HOME_URL*/', opt('--home-url', '../')))
wr('dist/artifact-carimbos.html', carimbos.replace('/*HOME_URL*/', opt('--home-url', '../')))
wr('dist/artifact-tarefas.html', tarefas.replace('/*HOME_URL*/', opt('--home-url', '../')))
wr('dist/artifact-licenca.html', licenca.replace('/*HOME_URL*/', opt('--home-url', '../')))
wr('dist/artifact-ferias.html', ferias.replace('/*HOME_URL*/', opt('--home-url', '../')))
wr('dist/artifact-ponto.html', ponto.replace('/*HOME_URL*/', opt('--home-url', '../')))
wr('dist/artifact-pessoal.html', pessoal.replace('/*HOME_URL*/', opt('--home-url', '../')))
wr('dist/artifact-fluxogramas.html', flow.replace('/*HOME_URL*/', opt('--home-url', '../')))
print('ok')
