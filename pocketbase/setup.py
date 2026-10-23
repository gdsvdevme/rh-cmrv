#!/usr/bin/env python3
"""Cria no PocketBase as coleções do sistema RH CMRV e a conta de acesso do app.

Variáveis de ambiente (nunca grave senhas no repositório):
  PB_URL             endereço do PocketBase (ex.: https://pb.devgabriel.app.br)
  PB_ADMIN_EMAIL     e-mail do superusuário
  PB_ADMIN_PASSWORD  senha do superusuário
  PB_ALLOWED_EMAILS  e-mails (separados por vírgula) que podem usar o sistema; a conta
                     precisa existir na coleção `users` do PocketBase
  PB_APP_EMAIL / PB_APP_PASSWORD  (opcional) cria essa conta em `users` se ainda não existir

Coleções (acesso só para os e-mails permitidos; a coleção `users` não é alterada):
  rhcmrv_docs     key (único) + data (json)   -> painel, estado dos fluxogramas, hierarquia de pessoal
  rhcmrv_versoes  vid (único), at, label, json -> cópias de segurança dos fluxogramas
O script é repetível: o que já existe é mantido.
"""
import json, os, sys, urllib.request, urllib.error

URL = os.environ.get('PB_URL', '').rstrip('/')
EMAIL = os.environ.get('PB_ADMIN_EMAIL', '')
PASS = os.environ.get('PB_ADMIN_PASSWORD', '')
if not (URL and EMAIL and PASS):
    sys.exit('Defina PB_URL, PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD.')

token = ''
def call(method, path, body=None, ok404=False):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(URL + path, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if token: req.add_header('Authorization', token)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        if ok404 and e.code == 404: return None
        sys.exit('%s %s -> HTTP %s: %s' % (method, path, e.code, e.read().decode()[:400]))

# autenticação (>= 0.23 usa a coleção _superusers; antes, /api/admins)
new_api = True
try:
    r = call('POST', '/api/collections/_superusers/auth-with-password', {'identity': EMAIL, 'password': PASS}, ok404=True)
except SystemExit:
    r = None
if r is None:
    new_api = False
    r = call('POST', '/api/admins/auth-with-password', {'identity': EMAIL, 'password': PASS})
token = r['token']
print('Autenticado (%s).' % ('>=0.23' if new_api else '<0.23'))

allowed = [e.strip() for e in (os.environ.get('PB_ALLOWED_EMAILS') or os.environ.get('PB_APP_EMAIL', '')).split(',') if e.strip()]
if not allowed:
    sys.exit('Defina PB_ALLOWED_EMAILS (ou PB_APP_EMAIL) com quem pode usar o sistema.')
RULE = '@request.auth.collectionName = "users" && (' + ' || '.join('@request.auth.email = "%s"' % e.replace('"', '') for e in allowed) + ')'
BIG = 20 * 1024 * 1024

def fields(defs):
    out = []
    for name, typ in defs:
        f = {'name': name, 'type': typ, 'required': name in ('key', 'vid')}
        if typ == 'json': f['maxSize'] = BIG
        out.append(f)
    return out

def old_schema(defs):
    out = []
    for name, typ in defs:
        o = {'maxSize': BIG} if typ == 'json' else {}
        out.append({'name': name, 'type': typ, 'required': name in ('key', 'vid'), 'options': o})
    return out

COLS = [
    ('rhcmrv_docs', [('key', 'text'), ('data', 'json')], 'key'),
    ('rhcmrv_versoes', [('vid', 'text'), ('at', 'text'), ('label', 'text'), ('json', 'json')], 'vid'),
]
for name, defs, uniq in COLS:
    if call('GET', '/api/collections/' + name, ok404=True):
        print('Coleção %s já existe.' % name); continue
    body = {'name': name, 'type': 'base',
            'listRule': RULE, 'viewRule': RULE, 'createRule': RULE, 'updateRule': RULE, 'deleteRule': RULE,
            'indexes': ['CREATE UNIQUE INDEX idx_%s_%s ON %s (%s)' % (name, uniq, name, uniq)]}
    body['fields' if new_api else 'schema'] = fields(defs) if new_api else old_schema(defs)
    call('POST', '/api/collections', body)
    print('Coleção %s criada.' % name)

app_email, app_pass = os.environ.get('PB_APP_EMAIL', ''), os.environ.get('PB_APP_PASSWORD', '')
if app_email and app_pass:
    found = call('GET', '/api/collections/users/records?perPage=1&filter=' + urllib.request.quote('email="%s"' % app_email))
    if found and found.get('items'):
        print('Conta %s já existe.' % app_email)
    else:
        call('POST', '/api/collections/users/records', {'email': app_email, 'password': app_pass, 'passwordConfirm': app_pass, 'emailVisibility': True, 'verified': True})
        print('Conta %s criada.' % app_email)
print('Pronto.')
