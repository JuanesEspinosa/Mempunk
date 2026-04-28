[English](README.md) | [Español](README.es.md) | [Português](README.pt.md) | [Français](README.fr.md)

# Mempunk

[![npm version](https://img.shields.io/npm/v/mempunk)](https://www.npmjs.com/package/mempunk)
[![license](https://img.shields.io/npm/l/mempunk)](LICENSE)

Cerebro persistente para Claude Code — um vault de markdown que sobrevive entre sessoes.

## O Problema

Claude Code nao tem memoria entre sessoes. Cada vez que voce inicia uma nova conversa, ele nao sabe:

- No que voce estava trabalhando ontem
- Quais decisoes de arquitetura ja foram tomadas
- Quais tarefas estao pendentes ou concluidas
- Quais arquivos foram modificados e por que
- Quais eram os proximos passos

Voce acaba repetindo contexto, re-explicando decisoes e perdendo impulso. Quanto mais longo o projeto, pior fica.

## A Solucao

Mempunk e um vault de markdown estruturado que funciona como a memoria persistente do Claude. Funciona em dois momentos:

- **Inicio de sessao** (`/mempunk`): Claude le o vault, ve seus projetos, carrega o overview relevante, as convencoes, os ultimos session logs e o backlog. Retoma de onde voce parou.
- **Fim de sessao** (`/session-end`): Claude escreve o que fez, quais decisoes foram tomadas, o que falta e quais arquivos foram tocados. A proxima sessao comeca com contexto completo.

O vault sao arquivos markdown organizados por projeto. Voce gerencia com um CLI. Claude navega com slash commands. Tambem funciona como vault do Obsidian, entao voce pode navegar e buscar tudo visualmente.

Sem banco de dados. Sem servidor. Sem API keys. Apenas arquivos.

## Inicio Rapido

```bash
# 1. Criar e vincular um vault
npx mempunk

# 2. Adicionar um projeto
npx mempunk project meu-app

# 3. Em qualquer sessao do Claude Code, digite:
/mempunk

# 4. Quando terminar, digite:
/session-end
```

## Referencia do CLI

### Gerenciamento do vault

```
mempunk setup                  Setup interativo completo (recomendado)
mempunk init [caminho] [opcoes] Criar um novo vault
mempunk link <caminho>         Vincular um vault ao Claude Code (suporta multiplos)
mempunk unlink [caminho]       Desvincular um vault (interativo se houver varios)
mempunk status                 Dashboard do vault com info de projetos
mempunk sync                   Adicionar arquivos faltantes a projetos existentes
mempunk doctor                 Verificar saude e integridade do vault
mempunk -v                     Mostrar versao
```

### Gerenciamento de projetos

```
mempunk project <nome>         Adicionar um novo projeto ao vault
mempunk remove <nome>          Remover um projeto do vault
mempunk backlog <nome>         Ver o backlog de um projeto no terminal
mempunk log <nome>             Abrir o session log no seu editor
```

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
```

## Estrutura do Vault

```
vault/
├── CLAUDE.md              # Ponto de entrada — Claude le isso primeiro
├── projects/
│   └── meu-projeto/
│       ├── overview.md    # O que e o projeto, stack, repo, estado
│       ├── architecture.md # Decisoes tecnicas e diagramas
│       ├── conventions.md # Regras do projeto, padroes de codigo, padroes
│       ├── backlog.md     # Tarefas priorizadas (- [ ] / - [x])
│       ├── session-log.md # O que Claude fez em cada sessao
│       └── decisions/     # Architecture Decision Records
├── areas/                 # Responsabilidades continuas (nao projetos)
├── resources/             # Conhecimento tecnico reutilizavel
└── daily/                 # Logs de sessao diarios
```

`mempunk project <nome>` cria essa estrutura e registra o projeto no `CLAUDE.md` com um `[[wikilink]]` direto.

`mempunk sync` adiciona arquivos de template faltantes (como `conventions.md`) a projetos existentes sem sobrescrever.

## Fluxo de Sessao

### Inicio: `/mempunk`

Instalado globalmente em `~/.claude/skills/mempunk/` durante o setup. Ao digitar `/mempunk` em qualquer sessao do Claude Code, Claude:

1. Descobre todos os vaults vinculados automaticamente
2. Se houver multiplos vaults, pergunta qual usar
3. Le o `CLAUDE.md` do vault e o indice de projetos
4. Pergunta em qual projeto voce quer trabalhar
5. Le o overview e as convencoes do projeto
6. Le os ultimos 3 session logs e o backlog
7. Confirma o contexto antes de continuar

### Encerramento: `/session-end`

Instalado globalmente em `~/.claude/skills/session-end/`. Ao digitar `/session-end`, Claude:

1. Identifica em qual projeto se trabalhou
2. Escreve uma entrada estruturada no `session-log.md` do projeto
3. Inclui: o que foi feito, decisoes, estado atual, proximos passos, arquivos modificados
4. Nota convencoes que foram estabelecidas ou alteradas
5. Confirma o que foi registrado

A proxima sessao retoma exatamente de onde esta terminou.

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

## Compativel com Obsidian

Todos os arquivos usam `[[wikilinks]]`. Abra o vault no Obsidian e a visualizacao de grafo mostra as conexoes entre `CLAUDE.md`, overviews, backlogs, docs de arquitetura, convencoes e session logs.

## Idiomas

Disponiveis: **English** (padrao), **Espanol**, **Portugues**, **Francais**

Use `--lang es`, `--lang pt` ou `--lang fr` com qualquer comando, ou selecione interativamente durante o setup.

## Licenca

[MIT](LICENSE)
