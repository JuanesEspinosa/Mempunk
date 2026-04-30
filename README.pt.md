[English](README.md) | [Español](README.es.md) | [Português](README.pt.md) | [Français](README.fr.md)

# Mempunk

[![npm version](https://img.shields.io/npm/v/mempunk)](https://www.npmjs.com/package/mempunk)
[![license](https://img.shields.io/npm/l/mempunk)](LICENSE)

Cerebro persistente para CLIs de IA — um vault de markdown que sobrevive entre sessoes. Compativel com **Claude Code**, **opencode** e **gemini-cli**.

## O Problema

CLIs de IA nao tem memoria entre sessoes. Cada vez que voce inicia uma nova conversa, seu assistente nao sabe:

- No que voce estava trabalhando ontem
- Quais decisoes de arquitetura ja foram tomadas
- Quais tarefas estao pendentes ou concluidas
- Quais arquivos foram modificados e por que
- Quais eram os proximos passos
- Qual ferramenta CLI voce estava usando (Claude Code? opencode? gemini-cli?)

Voce acaba repetindo contexto, re-explicando decisoes e perdendo impulso. Quanto mais longo o projeto, pior fica.

Alem disso, se voce alterna entre diferentes CLIs de IA — Claude Code para alguns projetos, opencode ou gemini-cli para outros — cada ferramenta vive em seu proprio silo. Seu contexto fica fragmentado entre ferramentas.

## A Solucao

Mempunk e um vault de markdown estruturado que funciona como a memoria persistente do seu assistente. Funciona em dois momentos:

- **Inicio de sessao** (`/mempunk`): o assistente le o vault, ve seus projetos, carrega o overview relevante, as convencoes, os ultimos session logs e o backlog. Retoma de onde voce parou.
- **Fim de sessao** (`/session-end`): o assistente escreve o que fez, quais decisoes foram tomadas, o que falta e quais arquivos foram tocados. A proxima sessao comeca com contexto completo.

O vault sao arquivos markdown organizados por projeto. Voce gerencia com um CLI. Seu assistente de IA navega com slash commands. Tambem funciona como vault do Obsidian, entao voce pode navegar e buscar tudo visualmente.

Sem banco de dados. Sem servidor. Sem API keys. Apenas arquivos.

E como o vault e agnostico ao CLI, voce pode usar o mesmo vault com Claude Code, opencode e gemini-cli simultaneamente. Alterne entre CLIs sem perder contexto.

## Inicio Rapido

```bash
# 1. Execute o setup (pergunta qual CLI voce vai usar, cria e vincula um vault)
npx mempunk

# 2. Adicionar um projeto
npx mempunk project meu-app

# 3. Em qualquer sessao do seu CLI, digite:
/mempunk

# 4. Quando terminar, digite:
/session-end
```

## Referencia do CLI

### Gerenciamento do vault

```
mempunk setup                  Setup interativo completo (recomendado)
mempunk init [caminho] [opcoes] Criar um novo vault
mempunk link <caminho>         Vincular um vault ao seu CLI (suporta multiplos)
mempunk unlink [caminho]       Desvincular um vault (interativo se houver varios)
mempunk status                 Mostrar todos os vaults vinculados e seus projetos
mempunk cli add <nome>         Adicionar um CLI (claude-code, opencode, gemini-cli)
mempunk cli remove <nome>      Remover um CLI
mempunk cli list               Mostrar CLIs ativos
mempunk auto-start [on|off]    Auto-executar /mempunk em novas sessoes
mempunk -v                     Mostrar versao
```

### Gerenciamento de projetos

```
mempunk project <nome>         Adicionar um novo projeto ao vault
mempunk remove <nome>          Remover um projeto do vault
mempunk backlog <nome>         Ver o backlog de um projeto no terminal
mempunk log <nome>             Abrir o session log no seu editor
mempunk sync                   Adicionar arquivos faltantes a projetos existentes
mempunk doctor                 Verificar saude e integridade do vault
```

> Todos os comandos de projeto perguntam qual vault usar quando ha varios vinculados.

### Opcoes

```
--lang <codigo>    Idioma: en, es, pt, fr (padrao: en)
--preset <nome>    Preset: full, standard, minimal
--projects         Incluir pasta projects
--areas            Incluir pasta areas
--resources        Incluir pasta resources
--daily            Incluir pasta daily
```

### Exemplos

```bash
mempunk setup --lang pt
mempunk init ./vault --preset full
mempunk init ./vault --projects --resources --daily
mempunk project meu-saas
mempunk remove meu-saas
mempunk backlog meu-saas
mempunk log meu-saas
mempunk sync
mempunk doctor
mempunk status
mempunk cli add opencode
mempunk cli add gemini-cli
mempunk cli list
mempunk cli remove opencode
```

## Estrutura do Vault

```
vault/
├── CLAUDE.md              # Ponto de entrada — Claude le isso primeiro
├── projects/
│   └── meu-projeto/
│       ├── INDEX.md       # Entrada rapida — status, top 3 backlog, links
│       ├── overview.md    # O que e o projeto, stack, repo, status
│       ├── architecture.md # Decisoes tecnicas e diagramas
│       ├── conventions.md # Regras do projeto, padroes de codigo
│       ├── backlog.md     # Tarefas priorizadas (- [ ] / - [x])
│       ├── session-log.md # O que Claude fez em cada sessao
│       └── decisions/     # Architecture Decision Records
├── areas/                 # Responsabilidades continuas (nao projetos)
│   └── INDEX.md           # Indice de areas
├── resources/             # Conhecimento tecnico reutilizavel
│   └── INDEX.md           # Indice de recursos por categoria
└── daily/                 # Logs diarios consolidados
    └── INDEX.md           # Indice de logs diarios
```

`CLAUDE.md` linka diretamente ao `INDEX.md` de cada projeto — nunca a arquivos internos. Cada `INDEX.md` linka aos arquivos internos do projeto. Isso mantem o grafo do Obsidian limpo (arvore, nao teia de aranha).

`mempunk project <nome>` cria essa estrutura e registra o projeto no `CLAUDE.md` com um `[[wikilink]]` direto ao seu `INDEX.md`.

`mempunk sync` adiciona arquivos de template faltantes (como `INDEX.md`, `conventions.md`) a projetos existentes sem sobrescrever.

## CLIs Suportados

mempunk suporta o uso de multiplos CLIs simultaneamente com o mesmo vault. Durante o `setup`, selecione um ou mais CLIs. Voce pode adicionar mais depois com `mempunk cli add <nome>`. Cada CLI usa seu mecanismo nativo:

| CLI | Registro do vault | Localizacao das skills |
|---|---|---|
| **Claude Code** | `~/.claude.json` → `additionalDirectories[]` | `~/.claude/skills/<name>/SKILL.md` |
| **opencode** | `~/.config/opencode/AGENTS.md` (marcadores) | `~/.config/opencode/skills/<name>/SKILL.md` |
| **gemini-cli** | `~/.gemini/settings.json` → `context.includeDirectories[]` | `~/.gemini/skills/<name>/SKILL.md` |

O vault em si (arquivos markdown em `projects/`, `daily/`, etc.) e o mesmo independentemente do CLI — e portavel. Quando voce faz `link` ou `unlink` de um vault, a operacao se aplica a todos os CLIs ativos de uma vez. Seus CLIs ativos ficam persistidos em `~/.mempunk/config.json`.

### Compatibilidade de features

| Feature | Claude Code | opencode | gemini-cli |
|---|:---:|:---:|:---:|
| Vincular/desvincular vault | ✔ | ✔ | ✔ |
| Multi-vault | ✔ | ✔ | ✔ |
| Skill `/mempunk` | ✔ | ✔ | ✔ |
| Skill `/session-end` | ✔ | ✔ | ✔ |
| Smart Context Check | ✔ | ✔ | ✔ |
| ADRs automaticos | ✔ | ✔ | ✔ |
| Backlog inteligente | ✔ | ✔ | ✔ |
| Daily consolidado | ✔ | ✔ | ✔ |
| Captura de conhecimento | ✔ | ✔ | ✔ |
| `sync` / `doctor` | ✔ | ✔ | ✔ |
| Auto-start | ✔ | ✘ | ✔ |
| Multi-CLI simultaneo | ✔ | ✔ | ✔ |

> Skills, ADRs, atualizacoes de backlog e logs diarios sao features a nivel de vault — funcionam em qualquer CLI que leia o `CLAUDE.md` do vault. Auto-start requer hooks de sessao, que o opencode nao suporta.

## Fluxo de Sessao

### Inicio: `/mempunk`

Instalado globalmente durante o setup no caminho de skills que seu CLI usa (ver tabela acima). Ao digitar `/mempunk`, o assistente:

1. Descobre todos os vaults vinculados automaticamente
2. Se houver multiplos vaults, pergunta qual usar
3. Le o `CLAUDE.md` do vault e lista os projetos disponiveis
4. Pergunta em qual projeto voce quer trabalhar — nunca assume
5. Le o `INDEX.md`, `overview.md` e `conventions.md` do projeto
6. Le os ultimos 3 session logs e o backlog
7. **Smart Context Check** — detecta gaps (session-log antigo, overview vazio, arquitetura sem definir, backlog vazio) e oferece revisar o repo real se necessario
8. Confirma o contexto antes de continuar

### Encerramento: `/session-end`

Instalado junto ao `/mempunk`. Ao digitar `/session-end`, o assistente:

1. Escreve uma entrada estruturada no `session-log.md` do projeto
2. **Atualiza o backlog** — marca tarefas completadas, adiciona novas, reordena por prioridade
3. **Atualiza INDEX.md** — reflete a ultima sessao e top 3 do backlog
4. **Escreve log diario** — cria ou atualiza `daily/YYYY-MM-DD.md` com resumo consolidado
5. Nota convencoes que foram estabelecidas ou mudaram
6. Confirma o que foi registrado

A proxima sessao retoma exatamente de onde esta terminou.

### Skills automaticos

O `CLAUDE.md` do vault inclui regras que o assistente segue automaticamente durante qualquer sessao:

- **ADRs automaticos** — Quando uma decisao tecnica e tomada (arquitetura, stack, padroes), um ADR e criado em `decisions/` sem ser solicitado
- **Captura de conhecimento** — Quando um problema tecnico reutilizavel e resolvido, a solucao e salva em `resources/` por categoria
- **Contexto de areas** — Quando o usuario pergunta sobre universidade ou infraestrutura, o assistente le o INDEX da area correspondente primeiro

## Manutencao do Vault

```bash
# Adicionar arquivos faltantes a projetos existentes apos atualizar mempunk
mempunk sync

# Verificar integridade — projetos fantasma, arquivos faltantes, registros quebrados
mempunk doctor
```

## Multiplos Vaults

Voce pode vincular multiplos vaults e alternar entre eles no inicio da sessao:

```bash
mempunk link ./vault-trabalho
mempunk link ./vault-pessoal

# /mempunk vai perguntar qual vault usar

mempunk unlink ./vault-pessoal    # Desvincular um vault especifico
mempunk unlink                    # Selecao interativa se houver varios
mempunk status                    # Mostra todos os vaults vinculados
```

## Multiplos CLIs

Use o mesmo vault com diferentes CLIs de IA ao mesmo tempo:

```bash
# Adicionar um segundo CLI
mempunk cli add opencode

# Adicionar um terceiro
mempunk cli add gemini-cli

# link/unlink agora registra em todos os CLIs ativos de uma vez
mempunk link ./meu-vault    # Registra no Claude Code, opencode E gemini-cli

# Ver quais CLIs estao ativos
mempunk cli list

# Remover um
mempunk cli remove gemini-cli
```

`doctor` verifica skills em todos os CLIs ativos. `status` agrega vaults de todos os CLIs.

## Auto-start

Carregue automaticamente o contexto do vault no inicio de cada nova sessao do Claude Code:

```bash
# Ativar
mempunk auto-start on

# Desativar
mempunk auto-start off

# Ver status
mempunk auto-start
```

Isso instala um hook `SessionStart` no `settings.json` do CLI. Quando ativado, `/mempunk` e executado automaticamente em cada nova sessao — sem necessidade de digitar manualmente. Se voce tiver multiplos CLIs suportados ativos, o comando pergunta qual configurar.

> **Nota:** Auto-start esta disponivel para **Claude Code** e **gemini-cli**. opencode nao suporta hooks de sessao. Se voce desvincular todos os vaults, os hooks sao removidos automaticamente.

## Compativel com Obsidian

Todos os arquivos usam `[[wikilinks]]`. Abra o vault no Obsidian e a visualizacao de grafo mostra as conexoes entre `CLAUDE.md`, overviews, backlogs, docs de arquitetura, convencoes e session logs.

## Idiomas

Disponiveis: **English** (padrao), **Espanol**, **Portugues**, **Francais**

Use `--lang es`, `--lang pt` ou `--lang fr` com qualquer comando, ou selecione interativamente durante o setup.

## Licenca

[MIT](LICENSE)
