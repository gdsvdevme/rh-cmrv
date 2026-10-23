#!/usr/bin/env python3
"""Junta src/ em dist/: index.html (documento completo) e artifact.html (fragmento)."""
import glob, os
root = os.path.dirname(os.path.abspath(__file__))
rd = lambda p: open(os.path.join(root, p), encoding='utf-8').read()
css = rd('src/styles.css')
js = '\n'.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(os.path.join(root, 'src/js/*.js'))))
js = js.replace('</script>', '<\\/script>')
frag = rd('src/index.template.html').replace('/*CSS*/', css).replace('/*JS*/', js)
os.makedirs(os.path.join(root, 'dist'), exist_ok=True)
open(os.path.join(root, 'dist/artifact.html'), 'w', encoding='utf-8').write(frag)
head = '<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body style="margin:0">\n'
open(os.path.join(root, 'dist/index.html'), 'w', encoding='utf-8').write(head + frag + '\n</body></html>\n')
print('ok', len(frag))
