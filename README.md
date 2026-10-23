# RH Câmara Rio Verde — Gestão de Pessoas e Processos Administrativos

Sistema web editável (sem servidor, sem dependências para rodar) com organograma, fluxogramas, competências, matriz de responsabilidades, manual e indicadores.

## Estrutura
- `site/index.html`: painel **Sistema Interno – RH Câmara Municipal de Rio Verde** (tela inicial, com um ícone para cada mini sistema).
- `site/fluxogramas/index.html`: sistema de fluxogramas, competências, matriz, manual e indicadores.
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

## Como salvar e exportar
- Salva automaticamente após cada alteração; o botão Salvar força o salvamento.
- Configurações: cópias de segurança e restauração de versões, exportar/importar JSON, restaurar modelo inicial.
- Exclusões podem ser desfeitas pelo aviso "Desfazer".
- Matriz e indicadores: CSV, Excel e PDF. Manual: PDF e Markdown.

## Onde ficam os dados
Ao abrir os arquivos de `site/`, os dados ficam **somente no navegador deste computador** (localStorage). **Não há sincronização entre computadores**; use Exportar/Importar JSON.

## Avisos
Os indicadores iniciais são demonstrativos e fictícios. Os parâmetros de férias começam vazios, sem prazos ou direitos pré-definidos. O sistema não autoriza nomeações, exonerações, pagamentos ou concessões; a autoridade competente permanece responsável. Não cadastre dados pessoais reais.

> Esta ferramenta tem finalidade organizacional e administrativa. As competências, os procedimentos e os fluxos apresentados deverão ser compatibilizados com a legislação municipal vigente, os atos normativos da Câmara Municipal de Rio Verde/GO e as orientações da Procuradoria-Geral e da Controladoria Interna. A ferramenta não substitui a análise jurídica dos atos administrativos.
