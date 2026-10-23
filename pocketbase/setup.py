#!/usr/bin/env python3
"""Cria no PocketBase as coleções do sistema RH CMRV e a conta de acesso do app.

Variáveis de ambiente (nunca grave senhas no repositório):
  PB_URL             endereço do PocketBase (ex.: https://pb.devgabriel.app.br)
  PB_ADMIN_EMAIL     e-mail do superusuário
  PB_ADMIN_PASSWORD  senha do superusuário
  PB_APP_USER / PB_APP_USER_PASSWORD  login simples do sistema (ex.: rh), criado na coleção
                     própria `rhcmrv_users`; a senha pode ser curta (mínimo 4 caracteres)
  PB_ALLOWED_EMAILS  (opcional) e-mails da coleção `users` do PocketBase que também podem entrar
  PB_APP_EMAIL / PB_APP_PASSWORD  (opcional) cria essa conta em `users` se ainda não existir

Coleções (acesso só para as contas permitidas; a coleção `users` não é alterada):
  rhcmrv_users    login simples do sistema (username + senha)
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
app_user, app_user_pass = os.environ.get('PB_APP_USER', ''), os.environ.get('PB_APP_USER_PASSWORD', '')
if not allowed and not app_user:
    sys.exit('Defina PB_APP_USER (login simples) e/ou PB_ALLOWED_EMAILS com quem pode usar o sistema.')
parts = []
if app_user or not allowed: parts.append('@request.auth.collectionName = "rhcmrv_users"')
if allowed: parts.append('(@request.auth.collectionName = "users" && (' + ' || '.join('@request.auth.email = "%s"' % e.replace('"', '') for e in allowed) + '))')
RULE = ' || '.join(parts)
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

if app_user:
    if not new_api: sys.exit('O login simples exige PocketBase 0.23 ou mais novo.')
    if call('GET', '/api/collections/rhcmrv_users', ok404=True):
        print('Coleção rhcmrv_users já existe.')
    else:
        call('POST', '/api/collections', {'name': 'rhcmrv_users', 'type': 'auth', 'createRule': None,
            'fields': [{'name': 'username', 'type': 'text', 'required': True},
                       {'name': 'password', 'type': 'password', 'required': True, 'min': 4, 'system': True},
                       {'name': 'email', 'type': 'email', 'required': False, 'system': True}],
            'indexes': ['CREATE UNIQUE INDEX idx_rhcmrv_users_username ON rhcmrv_users (username)'],
            'passwordAuth': {'enabled': True, 'identityFields': ['username']}})
        print('Coleção rhcmrv_users criada.')
    if app_user_pass:
        f = call('GET', '/api/collections/rhcmrv_users/records?perPage=1&filter=' + urllib.request.quote('username="%s"' % app_user.replace('"', '')))
        if f and f.get('items'):
            call('PATCH', '/api/collections/rhcmrv_users/records/' + f['items'][0]['id'], {'password': app_user_pass, 'passwordConfirm': app_user_pass})
            print('Login %s atualizado.' % app_user)
        else:
            call('POST', '/api/collections/rhcmrv_users/records', {'username': app_user, 'password': app_user_pass, 'passwordConfirm': app_user_pass})
            print('Login %s criado.' % app_user)

COLS = [
    ('rhcmrv_docs', [('key', 'text'), ('data', 'json')], 'key'),
    ('rhcmrv_versoes', [('vid', 'text'), ('at', 'text'), ('label', 'text'), ('json', 'json')], 'vid'),
]
for name, defs, uniq in COLS:
    if call('GET', '/api/collections/' + name, ok404=True):
        call('PATCH', '/api/collections/' + name, {'listRule': RULE, 'viewRule': RULE, 'createRule': RULE, 'updateRule': RULE, 'deleteRule': RULE})
        print('Coleção %s já existe (regras de acesso atualizadas).' % name); continue
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
