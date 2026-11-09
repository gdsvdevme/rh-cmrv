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
  rhcmrv_tarefas  checklist do RH: compartilhadas (toda a equipe) ou privadas (só o dono), com regras próprias
  rhcmrv_recibos  recibos em PDF da entrega dos espelhos de ponto (Controle de devolução); a tela apaga os vencidos (90 dias)
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
                       {'name': 'email', 'type': 'email', 'required': False, 'system': True},
                       {'name': 'admin', 'type': 'bool'}],
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

# administradores: campo bool "admin" em rhcmrv_users (só o superusuário altera; a função /api/centi-login o preenche a partir
# de CENTI_ADMIN_USERS) e, em rhcmrv_docs, só admin escreve no documento do painel dos mini sistemas (painel/tiles)
ADM = '(@request.auth.collectionName = "rhcmrv_users" && @request.auth.admin = true)'
PAINEL = 'painel/tiles'
if new_api:
    ucol = call('GET', '/api/collections/rhcmrv_users', ok404=True)
    if ucol and not any(f.get('name') == 'admin' for f in ucol.get('fields', [])):
        call('PATCH', '/api/collections/rhcmrv_users', {'fields': ucol['fields'] + [{'name': 'admin', 'type': 'bool'}]})
        print('Campo admin criado em rhcmrv_users.')
def regras(name):
    r = {'listRule': RULE, 'viewRule': RULE, 'createRule': RULE, 'updateRule': RULE, 'deleteRule': RULE}
    if name == 'rhcmrv_docs' and new_api:
        k = '(@request.body.key != "%s" || %s)' % (PAINEL, ADM)
        kk = '(key != "%s" || %s)' % (PAINEL, ADM)
        r.update({'createRule': '(%s) && %s' % (RULE, k), 'updateRule': '(%s) && %s && %s' % (RULE, kk, k), 'deleteRule': '(%s) && %s' % (RULE, kk)})
    return r

COLS = [
    ('rhcmrv_docs', [('key', 'text'), ('data', 'json')], 'key'),
    ('rhcmrv_versoes', [('vid', 'text'), ('at', 'text'), ('label', 'text'), ('json', 'json')], 'vid'),
]
for name, defs, uniq in COLS:
    if call('GET', '/api/collections/' + name, ok404=True):
        call('PATCH', '/api/collections/' + name, regras(name))
        print('Coleção %s já existe (regras de acesso atualizadas).' % name); continue
    body = {'name': name, 'type': 'base', **regras(name),
            'indexes': ['CREATE UNIQUE INDEX idx_%s_%s ON %s (%s)' % (name, uniq, name, uniq)]}
    body['fields' if new_api else 'schema'] = fields(defs) if new_api else old_schema(defs)
    call('POST', '/api/collections', body)
    print('Coleção %s criada.' % name)

# tarefas do RH: a compartilhada é da equipe; a privada só aparece para o dono (regras de acesso no servidor)
if new_api:
    AUTH = '@request.auth.collectionName = "rhcmrv_users"'
    VER = AUTH + ' && (compartilhada = true || dono = @request.auth.id)'
    regras = {'listRule': VER, 'viewRule': VER,
              'createRule': AUTH + ' && @request.body.dono = @request.auth.id',
              'updateRule': VER + ' && @request.body.dono:isset = false && (@request.body.compartilhada:isset = false || dono = @request.auth.id)',
              'deleteRule': VER}
    txt = lambda n, **k: dict({'name': n, 'type': 'text', 'required': False}, **k)
    RECORRENCIA = [txt('recorrencia', max=10), txt('dia_prazo', max=2), txt('serie', max=40), txt('ciclo', max=7)]
    col = call('GET', '/api/collections/rhcmrv_tarefas', ok404=True)
    if col:
        tem = set(f['name'] for f in col.get('fields', []))
        faltam = [f for f in RECORRENCIA if f['name'] not in tem]
        corpo = dict(regras)
        if faltam: corpo['fields'] = col.get('fields', []) + faltam   # mantém os campos existentes (com id) e acrescenta os da recorrência
        call('PATCH', '/api/collections/rhcmrv_tarefas', corpo)
        print('Coleção rhcmrv_tarefas já existe (regras atualizadas%s).' % (', campos da recorrência acrescentados' if faltam else ''))
    else:
        call('POST', '/api/collections', dict({'name': 'rhcmrv_tarefas', 'type': 'base',
            'fields': [txt('titulo', required=True, max=200), txt('descricao', max=4000), txt('coluna', max=20),
                       {'name': 'compartilhada', 'type': 'bool'}, txt('dono', required=True, max=40), txt('autor', max=120),
                       txt('prioridade', max=20), txt('prazo', max=10), txt('criada_em', max=40), txt('concluido_em', max=10)] + RECORRENCIA,
            'indexes': ['CREATE INDEX idx_rhcmrv_tarefas_dono ON rhcmrv_tarefas (dono)']}, **regras))
        print('Coleção rhcmrv_tarefas criada.')

# recibos de entrega dos espelhos de ponto (PDF protegido; a tela apaga os vencidos, 90 dias após o envio)
if new_api:
    AUTH_R = '@request.auth.collectionName = "rhcmrv_users"'
    if call('GET', '/api/collections/rhcmrv_recibos', ok404=True):
        call('PATCH', '/api/collections/rhcmrv_recibos', {k: AUTH_R for k in ('listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule')})
        print('Coleção rhcmrv_recibos já existe (regras atualizadas).')
    else:
        t_ = lambda n, m, **k: dict({'name': n, 'type': 'text', 'required': False, 'max': m}, **k)
        call('POST', '/api/collections', dict({'name': 'rhcmrv_recibos', 'type': 'base',
            'fields': [t_('ref', 7, required=True), t_('setor', 200), t_('por_nome', 120), t_('por_matricula', 20), t_('por_user', 60),
                       t_('criado_em', 40), t_('expira_em', 40),
                       {'name': 'arquivo', 'type': 'file', 'required': True, 'maxSelect': 1, 'maxSize': 10 * 1024 * 1024,
                        'mimeTypes': ['application/pdf'], 'protected': True}],
            'indexes': ['CREATE INDEX idx_rhcmrv_recibos_ref ON rhcmrv_recibos (ref)', 'CREATE INDEX idx_rhcmrv_recibos_exp ON rhcmrv_recibos (expira_em)']},
            **{k: AUTH_R for k in ('listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule')}))
        print('Coleção rhcmrv_recibos criada.')

app_email, app_pass = os.environ.get('PB_APP_EMAIL', ''), os.environ.get('PB_APP_PASSWORD', '')
if app_email and app_pass:
    found = call('GET', '/api/collections/users/records?perPage=1&filter=' + urllib.request.quote('email="%s"' % app_email))
    if found and found.get('items'):
        print('Conta %s já existe.' % app_email)
    else:
        call('POST', '/api/collections/users/records', {'email': app_email, 'password': app_pass, 'passwordConfirm': app_pass, 'emailVisibility': True, 'verified': True})
        print('Conta %s criada.' % app_email)
print('Pronto.')
