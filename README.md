# RH Câmara Rio Verde — Gestão de Pessoas e Processos Administrativos

Sistema web editável (sem servidor, sem dependências para rodar) com organograma, fluxogramas, competências, matriz de responsabilidades, manual e indicadores.

## Estrutura
- `site/index.html`: painel **Sistema Interno – RH Câmara Municipal de Rio Verde** (tela inicial, com um ícone para cada mini sistema).
- `site/fluxogramas/index.html`: sistema de fluxogramas, competências, matriz, manual e indicadores.
- `site/pessoal/index.html`: **Hierarquia de Pessoal** (importa planilha CSV).
- `site/ponto/index.html`: **Ponto – Servidores Externos**, simulação para apresentação: celular simulado (localização, assinatura digital e foto opcional) e painel administrativo em tempo real. Usa só dados fictícios, mantidos em memória, e não depende do PocketBase.
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
Os dados ficam no **PocketBase** (`https://pb.devgabriel.app.br`), nas coleções `rhcmrv_docs` (painel, fluxogramas e hierarquia de pessoal) e `rhcmrv_versoes` (cópias de segurança). Ao abrir o sistema, uma tela de login pede usuário (ou e-mail) e senha. O login simples (ex.: `rh`) fica na coleção própria `rhcmrv_users`; e-mails da coleção `users` do PocketBase só entram se estiverem em `PB_ALLOWED_EMAILS`; o navegador guarda apenas esse login (e o tema).

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

## Avisos
Os indicadores iniciais são demonstrativos e fictícios. Os parâmetros de férias começam vazios, sem prazos ou direitos pré-definidos. O sistema não autoriza nomeações, exonerações, pagamentos ou concessões; a autoridade competente permanece responsável. Não cadastre dados pessoais reais.

> Esta ferramenta tem finalidade organizacional e administrativa. As competências, os procedimentos e os fluxos apresentados deverão ser compatibilizados com a legislação municipal vigente, os atos normativos da Câmara Municipal de Rio Verde/GO e as orientações da Procuradoria-Geral e da Controladoria Interna. A ferramenta não substitui a análise jurídica dos atos administrativos.
