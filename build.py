#!/usr/bin/env python3
"""Gera o site e os fragmentos para publicação.

  site/index.html               painel "Sistema Interno" (página inicial)
  site/fluxogramas/index.html   sistema de fluxogramas e manual
  dist/artifact-*.html          fragmentos para publicar como artefato

Uso: python3 build.py [--flow-url URL] [--home-url URL]
  --flow-url  endereço do sistema de fluxogramas usado no painel (artefato)
  --home-url  endereço do painel usado no botão "Sistema Interno do RH" (artefato)
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
js = js.replace('</script>', '<\\/script>')
flow = rd('src/index.template.html').replace('/*CSS*/', css).replace('/*JS*/', js)
launcher = rd('src/launcher.template.html')

head = ('<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head>'
        '<body style="margin:0">\n')
page = lambda frag: head + frag + '\n</body></html>\n'

# site (hospedagem comum, ex.: Vercel)
wr('site/index.html', page(launcher.replace('/*FLOW_URL*/', 'fluxogramas/')))
wr('site/fluxogramas/index.html', page(flow.replace('/*HOME_URL*/', '../')))
# fragmentos de artefato
wr('dist/artifact-launcher.html', launcher.replace('/*FLOW_URL*/', opt('--flow-url', 'fluxogramas/')))
wr('dist/artifact-fluxogramas.html', flow.replace('/*HOME_URL*/', opt('--home-url', '../')))
print('ok')
