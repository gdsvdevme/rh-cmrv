#!/usr/bin/env python3
"""Gera o site e os fragmentos para publicação.

  site/index.html               painel "Sistema Interno" (página inicial)
  site/fluxogramas/index.html   sistema de fluxogramas e manual
  site/pessoal/index.html       hierarquia de pessoal (importa planilha CSV)
  site/ponto/index.html         ponto de servidores externos (simulação)
  dist/artifact-*.html          fragmentos para publicar como artefato

Uso: python3 build.py [--flow-url URL] [--home-url URL]
  --flow-url  endereço do sistema de fluxogramas usado no painel (artefato)
  --home-url  endereço do painel usado no botão "Sistema Interno do RH" (artefato)
  --pb-url  endereço do PocketBase (padrão: https://pb.devgabriel.app.br)
  --centi-url  endereço do site que hospeda as funções /api/centi-login e /api/centi (padrão: o próprio site;
               só é preciso informar em fragmentos de artefato, que ficam em outro endereço)
  --ponto-url  endereço do Ponto – Servidores Externos usado no painel (artefato)
  --pessoal-url  endereço da Hierarquia de Pessoal usado no painel (artefato)
"""
import glob, os, sys
root = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
rd = lambda p: open(os.path.join(root, p), encoding='utf-8').read()
def wr(p, s):
    p = os.path.join(root, p); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8').write(s)

css = rd('src/styles.css')
js = '\n'.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(os.path.join(root, 'src/js/*.js'))))
js = js.replace('/*VOLUME_CSS*/', rd('src/volume.css').replace('`', '\\`'))
pbjs = rd('src/pb.js').replace('/*PB_URL*/', opt('--pb-url', 'https://pb.devgabriel.app.br')).replace('/*CENTI_URL*/', opt('--centi-url', ''))
js = js.replace('</script>', '<\\/script>')
flow = rd('src/index.template.html').replace('/*CSS*/', css).replace('/*PB_JS*/', pbjs).replace('/*JS*/', js)
launcher = rd('src/launcher.template.html').replace('/*PB_JS*/', pbjs)
pessoal = rd('src/pessoal.template.html').replace('/*PB_JS*/', pbjs)
ponto = rd('src/ponto.template.html')

head = ('<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head>'
        '<body style="margin:0">\n')
page = lambda frag: head + frag + '\n</body></html>\n'

# site (hospedagem comum, ex.: Vercel)
wr('site/index.html', page(launcher.replace('/*FLOW_URL*/', 'fluxogramas/').replace('/*PESSOAL_URL*/', 'pessoal/').replace('/*PONTO_URL*/', 'ponto/')))
wr('site/ponto/index.html', page(ponto.replace('/*HOME_URL*/', '../')))
wr('site/pessoal/index.html', page(pessoal.replace('/*HOME_URL*/', '../')))
wr('site/fluxogramas/index.html', page(flow.replace('/*HOME_URL*/', '../')))
# fragmentos de artefato
wr('dist/artifact-launcher.html', launcher.replace('/*FLOW_URL*/', opt('--flow-url', 'fluxogramas/')).replace('/*PESSOAL_URL*/', opt('--pessoal-url', 'pessoal/')).replace('/*PONTO_URL*/', opt('--ponto-url', 'ponto/')))
wr('dist/artifact-ponto.html', ponto.replace('/*HOME_URL*/', opt('--home-url', '../')))
wr('dist/artifact-pessoal.html', pessoal.replace('/*HOME_URL*/', opt('--home-url', '../')))
wr('dist/artifact-fluxogramas.html', flow.replace('/*HOME_URL*/', opt('--home-url', '../')))
print('ok')
