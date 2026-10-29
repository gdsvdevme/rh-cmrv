# RH Câmara Rio Verde — Gestão de Pessoas e Processos Administrativos

Sistema web editável (sem servidor, sem dependências para rodar) com organograma, fluxogramas, competências, matriz de responsabilidades, manual e indicadores.

## Estrutura
- `site/index.html`: painel **Sistema Interno – RH Câmara Municipal de Rio Verde** (tela inicial, com um ícone para cada mini sistema).
- `site/fluxogramas/index.html`: sistema de fluxogramas, competências, matriz, manual e indicadores.
- `site/pessoal/index.html`: **Hierarquia de Pessoal**. O botão **Atualizar do Centi** consulta o **Cubo funcionário (FP051)** do Centi na referência atual (mês/ano editável em *Campos do Centi*) e traz só os servidores ativos, com cargo, vínculo, hierarquia (setor ou gabinete de cada vereador), matrícula e admissão; clique no nome para ver a ficha, que também mostra a **ficha financeira** (FP024) do mês escolhido, buscada na hora no Centi (proventos, descontos e líquido; nada é guardado). Quem não tem hierarquia (agentes políticos) fica de fora. Se algum campo vier errado, use **Campos do Centi** para escolher qual campo alimenta cada informação. A importação de planilha CSV continua disponível. Salário (só para ordenar), CPF e demais campos não são guardados. Variável opcional `CENTI_COMPANY` (padrão `1`, o órgão da Câmara).
- `site/ponto/index.html`: **Ponto – Servidores Externos**, simulação para apresentação: celular simulado (localização, assinatura digital e foto opcional) e painel administrativo em tempo real. Usa só dados fictícios, mantidos em memória, e não depende do PocketBase.
- `site/ferias/index.html`: **Férias**. Mostra quem está de férias hoje, as próximas férias, quem tem direito a gozar e quem está com férias vencidas. Usa o Cubo funcionário (FP051) e o Cubo movimentação férias (FP273) do Centi, só leitura: as férias já lançadas e o saldo são os do Centi; os períodos aquisitivos sem lançamento são calculados de 12 em 12 meses a partir da admissão. Clique em um servidor para ver todos os períodos aquisitivos. Em **Regras** ficam os dias de férias por período (padrão 30), o prazo para gozar antes de vencer (padrão 12 meses após o fim do período) e a janela das próximas férias; são valores de partida e devem ser conferidos com a legislação municipal. Exporta CSV da lista filtrada. Agentes políticos (sem hierarquia) e pensionistas ficam de fora.
- `site/tarefas/index.html`: **Tarefas do RH**, checklist em quadro (A fazer, Em andamento, Concluído). Ao criar uma tarefa é obrigatório escolher e confirmar quem a vê: **toda a equipe** (qualquer usuário vê, move, edita e exclui) ou **privada** (só o dono; a regra é aplicada no servidor, na coleção `rhcmrv_tarefas`). As concluídas saem do quadro quando o mês vira, mas ficam guardadas ("Mostrar concluídas de meses anteriores"). **Tarefas recorrentes:** em *Repetição* escolha "Todo mês" e o dia limite (ou "sem data específica"). Todo mês uma nova tarefa nasce em *A fazer* (com prazo até aquele dia); a concluída sai na virada do mês, e a que ficou aberta continua no quadro como atrasada. Ao excluir uma recorrente dá para *dispensar só este mês* ou *excluir e parar a repetição*. A visibilidade (equipe ou privada) é escolhida ao criar e não muda depois. Os dados ficam só no servidor; a coleção é criada automaticamente no primeiro login depois da atualização (ou por `pocketbase/setup.py`).
- Cada novo mini sistema deve ter sua pasta em `site/` (por exemplo `site/ferias/`) e ser cadastrado no painel com o botão **Editar painel**, informando o endereço (por exemplo `ferias/`).
- `src/`: código-fonte. `build.py`: gera `site/` e `dist/`.

## Como executar
- Abra `site/index.html` em um navegador (Chrome, Edge ou Firefox). Funciona sem internet, exceto as fontes e a exportação Excel (que carrega a biblioteca SheetJS).
- Publicação na Vercel: framework **Other**, sem Build Command e **Output Directory = `site`**.
- Para reconstruir a partir do código: `python3 build.py` (junta `src/` em `dist/`).

## Como editar fluxogramas e organograma
- Clique em um elemento para abrir o painel de edição (título, descrição, unidade, responsável, prazo, documentos, status, observações, cor, tipo).
- Arraste para mover. Arraste da bolinha azul de um elemento até outro para conectar. Decisões têm saídas SIM/NÃO configuráveis.
- Botões da barra: adicionar elementos, Desfazer/Refazer (Ctrl+Z / Ctrl+Y), Organizar, zoom (Ctrl+roda), Ajustar, PNG, SVG, PDF, Imprimir. Delete remove o selecionado.

## Volume para encadernação
Na página **Painel Inicial** ou **Manual de Procedimentos**, o botão **Gerar volume** monta capa, sumário, fluxogramas e manual em A4 com margens espelhadas e numeração. Ele abre uma página própria: clique em **Imprimir / Salvar como PDF** (Chrome ou Edge, tamanho A4, com gráficos de plano de fundo). Na versão publicada como artefato, o botão baixa um arquivo `.html` para abrir no navegador.

## Como salvar e exportar
- Salva automaticamente após cada alteração; o botão Salvar força o salvamento.
- Configurações: cópias de segurança e restauração de versões, exportar/importar JSON, restaurar modelo inicial.
- Exclusões podem ser desfeitas pelo aviso "Desfazer".
- Matriz e indicadores: CSV, Excel e PDF. Manual: PDF e Markdown.

## Onde ficam os dados
Os dados ficam no **PocketBase** (`https://pb.devgabriel.app.br`), nas coleções `rhcmrv_docs` (painel, fluxogramas e hierarquia de pessoal) e `rhcmrv_versoes` (cópias de segurança). Ao abrir o sistema, a tela de login pede o **usuário e a senha do Centi** (veja "Login com o Centi" abaixo). A conta de cada pessoa fica na coleção `rhcmrv_users`; o navegador guarda a sessão (tokens) e o tema, nunca a senha.

- **Migração automática:** se houver dados antigos no localStorage do navegador e o servidor ainda não os tiver, eles são enviados ao servidor na primeira abertura, conferidos e só então apagados do navegador. Abra uma vez cada sistema (painel, fluxogramas, pessoal) em cada computador que tenha dados locais.
- **Sem conexão:** se o servidor não responder (ou você escolher "Usar só neste navegador"), o sistema volta a salvar localmente, como antes.
- Outro endereço de servidor: `python3 build.py --pb-url https://seu-pocketbase`.

### Configurar o PocketBase
```
export PB_URL=https://pb.devgabriel.app.br
export PB_ADMIN_EMAIL=...  PB_ADMIN_PASSWORD=...        # superusuário
export PB_APP_USER=rh PB_APP_USER_PASSWORD=...          # login simples do sistema (coleção rhcmrv_users; senha de 4+ caracteres)
export PB_ALLOWED_EMAILS=a@x.com,b@y.com                # opcional: e-mails da coleção users que também entram
export PB_APP_EMAIL=...    PB_APP_PASSWORD=...          # opcional: cria essa conta se ainda não existir
python3 pocketbase/setup.py
```
O script cria as coleções (acesso só para as contas permitidas) sem alterar a coleção `users`, e a cada execução atualiza as regras de acesso e a senha do login simples.

**Atenção:** senhas curtas como `1234` podem ser adivinhadas por qualquer pessoa na internet em poucos minutos. Prefira uma senha longa e, se possível, ative o limite de tentativas do PocketBase (Configurações → Rate limiting). Pode ser executado de novo sem duplicar nada. Nunca grave senhas no repositório.

## Login com o Centi
O sistema entra com o mesmo usuário e senha do Centi (`go.centi.com.br/camararioverde`). Duas funções da Vercel (pasta `api/`) fazem a ponte, porque o Centi só reconhece a Câmara pelo cabeçalho `Referer`, que o navegador não consegue enviar:
- `api/centi-login.js`: confere usuário e senha no Centi, verifica se a pessoa está em `CENTI_ALLOWED_USERS`, cria (uma vez) ou reaproveita a conta dela em `rhcmrv_users` e devolve a sessão do PocketBase e do Centi. A senha do Centi não é gravada.
- `api/centi.js`: repassa consultas ao Centi com o token da própria pessoa (o Centi aplica as permissões dela). Só aceita `restauth/searchentity`; para liberar outras rotas, inclua-as em `ROTAS`.

No código das páginas, depois do login: `PB.centi.user`, `PB.centi.nome` e `PB.centi.search('SFuncionario', [{FieldName:'Nome', Operation:6, Value:'%ana%'}])` (o Centi exige ao menos um filtro com valor; `Operation: 6` = contém).

**Variáveis de ambiente na Vercel** (Settings → Environment Variables; nunca no repositório):
- `CENTI_ALLOWED_USERS`: usuários do Centi que podem usar o sistema, separados por vírgula (ex.: `usuario1,usuario2`). Sem isso, ninguém entra.
- `APP_SECRET`: texto longo e aleatório; deriva a senha interna de cada conta do PocketBase. Não pode mudar depois (mudar pede nova criação das contas).
- `PB_ADMIN_EMAIL` e `PB_ADMIN_PASSWORD`: superusuário do PocketBase, usado só para criar a conta de quem entra pela primeira vez.
- `PB_URL` (opcional, padrão `https://pb.devgabriel.app.br`).

Antes de publicar, rode `pocketbase/setup.py` para garantir que a coleção `rhcmrv_users` existe. Para que **só** o Centi dê acesso, apague no PocketBase o login simples antigo (`rh`) e remova os e-mails de `PB_ALLOWED_EMAILS`. Usuários do Centi com PIN (dois fatores) ainda não são suportados. Em fragmentos de artefato (`dist/`), que ficam em outro endereço, gere com `python3 build.py --centi-url https://seu-site.vercel.app`.

## Avisos
Os indicadores iniciais são demonstrativos e fictícios. Os parâmetros de férias começam vazios, sem prazos ou direitos pré-definidos. O sistema não autoriza nomeações, exonerações, pagamentos ou concessões; a autoridade competente permanece responsável. Não cadastre dados pessoais reais.

> Esta ferramenta tem finalidade organizacional e administrativa. As competências, os procedimentos e os fluxos apresentados deverão ser compatibilizados com a legislação municipal vigente, os atos normativos da Câmara Municipal de Rio Verde/GO e as orientações da Procuradoria-Geral e da Controladoria Interna. A ferramenta não substitui a análise jurídica dos atos administrativos.
