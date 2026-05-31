[English](README.md) | [Español](README.es.md) | [Português](README.pt.md) | [Français](README.fr.md)

# Mempunk

[![npm version](https://img.shields.io/npm/v/mempunk)](https://www.npmjs.com/package/mempunk)
[![license](https://img.shields.io/npm/l/mempunk)](LICENSE)

Memoria persistente entre sessoes do Claude Code.

## O Problema

CLIs de IA nao tem memoria entre sessoes. Cada vez que voce inicia uma nova conversa, seu assistente nao sabe:

- No que voce estava trabalhando ontem
- Quais decisoes de arquitetura ja foram tomadas
- Quais tarefas estao pendentes ou concluidas
- Quais arquivos foram modificados e por que
- Quais eram os proximos passos
- Qual ferramenta CLI voce estava usando (Claude Code? opencode? gemini-cli?)

Voce acaba repetindo contexto, re-explicando decisoes e perdendo impulso. Quanto mais longo o projeto, pior fica.

Mas ha um problema mais profundo: mesmo que um CLI *lembrasse* de tudo, historico bruto e contexto ineficiente. Ler 20 session logs para entender onde um projeto esta e quase tao lento quanto comecar do zero. O que voce precisa nao e um log — e um estado compilado que fica mais preciso com o tempo, nao uma pilha de entradas que continua crescendo.

Alem disso, se voce alterna entre diferentes CLIs de IA — Claude Code para alguns projetos, opencode ou gemini-cli para outros — cada ferramenta vive em seu proprio silo. Seu contexto fica fragmentado entre ferramentas.

## A Solucao

Mempunk da ao seu IA um vault estruturado respaldado por SQLite e arquivos markdown — e o mantem compilado, nao apenas armazenado.

- **Inicio de sessao** (`vault-skills/session-start.md`): o assistente carrega o estado compilado do projeto de `wiki/state.md` se existir, ou os ultimos session logs caso contrario. Sem re-explicar. Sem re-derivar. Retoma de onde voce parou.
- **Fim de sessao** (`vault-skills/session-end.md`): o assistente escreve o session log, atualiza o backlog e reescreve o estado compilado — uma sintese fresca de tudo que aconteceu ate agora. A proxima sessao comeca com um snapshot denso e preciso em vez de historico bruto.
- **O vault** (sempre): cada projeto acumula um `wiki/` — uma base de conhecimento que o LLM constroi e mantem. Cada sessao o torna mais preciso. Cada fonte que voce adiciona o enriquece.

O vault sao arquivos markdown organizados por projeto, com SQLite como backend estruturado. Voce gerencia com um CLI. Seu assistente de IA navega com os protocolos definidos em `vault-skills/`. Tambem funciona como vault do Obsidian, entao voce pode navegar e buscar tudo visualmente.

Como o vault e agnostico ao CLI, voce pode usar o mesmo vault com Claude Code, opencode e gemini-cli simultaneamente. Alterne entre CLIs sem perder contexto.

## Inicio Rapido

```bash
npm install -g mempunk
mempunk setup
```

`setup` pergunta qual CLI de IA voce usa e configura tudo: cria `~/Dev-Brain/`, vincula ao seu CLI, e instala hooks + agentes (Claude Code) ou os protocolos vault-skills (Gemini CLI / opencode).

## Estrutura do Vault

```
~/Dev-Brain/
├── projects/
│   └── <id>/
│       ├── INDEX.md        metadados (nome, created_at, status)
│       ├── decisions/      architecture decision records (ADRs)
│       ├── skills/         stack, padroes, convencoes — carregados em cada sessao
│       └── wiki/           base de conhecimento mantida pelo LLM
│           ├── state.md    estado compilado — reescrito em cada sessao
│           ├── log.md      historico append-only de sessoes
│           ├── index.md    catalogo de todas as paginas do wiki
│           └── sources/    documentos para o LLM ingerir
├── areas/                  responsabilidades continuas, nao projetos
├── resources/              links e referencias
├── daily/                  logs diarios narrativos
└── .mempunk/
    ├── mempunk.db          banco de dados SQLite — nao editar manualmente
    └── hooks.log           log de execucao dos hooks do ciclo de vida
```

`wiki/state.md` e o diferencial central. E o *estado compilado* do projeto — o que e verdade agora, nao o que aconteceu em ordem. O LLM o reescreve ao final de cada sessao. Ler um arquivo compilado e mais rapido e preciso do que ler N session logs. Cada sessao o torna mais preciso. Cada fonte que voce adiciona o enriquece. Voce nunca o escreve.

## Fluxo de Sessao

### Inicio de sessao

**Com agentes (Claude Code, modo automatico):** invoque `@mempunk-loader`. Lista seus projetos, pergunta com qual trabalhar, ativa e retorna um resumo compacto de contexto. Se voce ativou `auto-start`, executa automaticamente ao abrir o Claude Code.

**Sem agentes (modo manual / Gemini CLI / opencode):** siga `vault-skills/session-start.md`. O assistente:

1. Executa `mempunk project activate <id>` para definir o projeto ativo
2. Executa `mempunk session last <project_id>` para saber o que a sessao anterior fez
3. Executa `mempunk skill list <project_id>` e le todos os arquivos de skill relevantes
4. Le o estado do projeto — `wiki/state.md` se existir, caso contrario os ultimos 3 session log entries
5. Executa `mempunk backlog list <project_id> --status pending`
6. Confirma o contexto antes de continuar

### Saves incrementais (durante a sessao)

O assistente salva contexto imediatamente quando acontece — nao apenas ao final da sessao:

- **Decisao arquitetural tomada** → `mempunk decision add` imediatamente
- **Bug importante resolvido** → `mempunk session log` com o resumo do fix
- **Tarefa concluida ou iniciada** → `mempunk backlog update` imediatamente
- **Skill do projeto modificado** → `mempunk skill update` imediatamente
- **Link ou referencia relevante capturada** → `mempunk resource add` imediatamente
- **Bloco de trabalho importante concluido** → `mempunk daily log` com resumo do bloco

Se uma sessao for interrompida, o contexto importante ja esta persistido.

### Fim de sessao (`vault-skills/session-end.md`)

Ao encerrar uma sessao, o assistente:

1. Executa `mempunk backlog update` para cada tarefa que mudou de status durante a sessao
2. Executa `mempunk decision add` para cada decisao importante ainda nao salva
3. Executa `mempunk session log` com um resumo e a lista de arquivos tocados
4. Atualiza `wiki/state.md` — o reescreve como sintese compilada do estado atual do projeto
5. Adiciona ao `wiki/log.md`
6. Cria ou adiciona ao `daily/YYYY-MM-DD.md`

A proxima sessao retoma exatamente de onde esta terminou.

## Comandos

| Comando | Descricao | Exemplo |
|---------|-----------|---------|
| `mempunk init` | Criar estrutura do vault e inicializar BD | `mempunk init` |
| `mempunk project add <id> <name>` | Registrar um projeto novo | `mempunk project add api "Backend API"` |
| `mempunk project list` | Listar todos os projetos | `mempunk project list` |
| `mempunk backlog add <project_id> "<title>"` | Adicionar tarefa ao backlog | `mempunk backlog add api "Adicionar auth"` |
| `mempunk backlog add ... --priority <1\|2\|3>` | Adicionar tarefa com prioridade (padrao: 2) | `mempunk backlog add api "Fix CORS" --priority 1` |
| `mempunk backlog list <project_id>` | Listar todas as tarefas | `mempunk backlog list api` |
| `mempunk backlog list ... --status <valor>` | Filtrar por status | `mempunk backlog list api --status pending` |
| `mempunk backlog update <id> --status <valor>` | Atualizar status da tarefa | `mempunk backlog update bl_123 --status done` |
| `mempunk backlog update <id> --priority <valor>` | Atualizar prioridade da tarefa | `mempunk backlog update bl_123 --priority 1` |
| `mempunk decision add <project_id> "<title>"` | Criar um ADR com arquivo markdown | `mempunk decision add api "Usar JWT"` |
| `mempunk decision add ... --tags "t1,t2"` | Criar decisao com tags | `mempunk decision add api "JWT" --tags "auth,seguranca"` |
| `mempunk decision list <project_id>` | Listar decisoes do projeto | `mempunk decision list api` |
| `mempunk skill add <project_id> <name>` | Criar arquivo de skill do projeto | `mempunk skill add api stack` |
| `mempunk skill list <project_id>` | Listar skills do projeto | `mempunk skill list api` |
| `mempunk skill update <id> --file <path>` | Sobrescrever conteudo do skill | `mempunk skill update sk_123 --file stack.md` |
| `mempunk resource add <project_id> "<title>"` | Capturar um recurso externo | `mempunk resource add api "JWT spec" --url https://jwt.io` |
| `mempunk resource list <project_id>` | Listar recursos do projeto | `mempunk resource list api` |
| `mempunk daily log <project_id> "<content>"` | Adicionar entrada ao log diario | `mempunk daily log api "Terminei modulo de auth"` |
| `mempunk daily list <project_id>` | Listar entradas do log diario | `mempunk daily list api` |
| `mempunk session log <project_id> "<summary>"` | Registrar sessao de trabalho | `mempunk session log api "Implementei endpoint de login"` |
| `mempunk session log ... --files "p1,p2"` | Registrar sessao com arquivos tocados | `mempunk session log api "Fix" --files "src/auth.js"` |
| `mempunk session last <project_id>` | Ver a ultima sessao registrada | `mempunk session last api` |
| `mempunk search "<query>"` | Busca full-text no vault | `mempunk search "refresh token"` |
| `mempunk search "<query>" --project <id>` | Busca dentro de um projeto | `mempunk search "auth" --project api` |
| `mempunk sync` | Verificar consistencia disco ↔ BD | `mempunk sync` |
| `mempunk sync --project <id>` | Sync limitado a um projeto | `mempunk sync --project api` |
| `mempunk hooks install` | Instalar hooks + agentes globalmente em `~/.claude/` | `mempunk hooks install` |
| `mempunk hooks install --local` | Instalar hooks em `.claude/` do projeto atual | `mempunk hooks install --local` |
| `mempunk hooks uninstall` | Remover hooks do Mempunk | `mempunk hooks uninstall` |

## Manutencao do Vault

```bash
# Verificar consistencia entre arquivos em disco e o banco de dados
mempunk sync

# Verificar integridade do vault — arquivos faltantes, arquivos sem registro
mempunk doctor

# Ver versao do schema do vault e versao do CLI
mempunk vault version

# Aplicar migracoes de schema pendentes
mempunk vault upgrade
```

`mempunk vault upgrade` e seguro de executar a qualquer momento. Apenas aplica migracoes pendentes e nunca modifica dados existentes.

## Compatibilidade

| Feature | Claude Code | opencode | gemini-cli |
|---|:---:|:---:|:---:|
| Vincular/desvincular vault | ✔ | ✔ | ✔ |
| Multi-vault | ✔ | ✔ | ✔ |
| Protocolo inicio de sessao | ✔ | ✔ | ✔ |
| Protocolo fim de sessao | ✔ | ✔ | ✔ |
| Smart Context Check | ✔ | ✔ | ✔ |
| ADRs automaticos | ✔ | ✔ | ✔ |
| Backlog inteligente | ✔ | ✔ | ✔ |
| Daily consolidado | ✔ | ✔ | ✔ |
| Captura de conhecimento | ✔ | ✔ | ✔ |
| `sync` / `doctor` | ✔ | ✔ | ✔ |
| Wiki (`state.md`) | ✔ | ✔ | ✔ |
| Hooks (`hooks install`) | ✔ | ✘ | ✔ |
| Multi-CLI simultaneo | ✔ | ✔ | ✔ |

> Protocolos de sessao, ADRs, atualizacoes de backlog e logs diarios sao features a nivel de vault — funcionam em qualquer CLI que leia o `CLAUDE.md` do vault. Lifecycle hooks requerem suporte a eventos de sessao, que o opencode nao fornece.

## Como se Compara

| | Mempunk | RAG / upload de arquivos | Notas manuais | Engram |
|---|:---:|:---:|:---:|:---:|
| Persiste entre sessoes | ✔ | ✘ | ✔ | Parcial |
| Conhecimento acumula | ✔ | ✘ | Depende | ✘ |
| LLM faz a manutencao | ✔ | ✔ | ✘ | ✔ |
| Funciona offline, sem infraestrutura | ✔ | ✘ | ✔ | ✘ |
| Multi-CLI | ✔ | ✘ | ✔ | ✘ |

**vs RAG / upload de arquivos:** Ferramentas como NotebookLM ou upload de arquivos do ChatGPT recuperam de documentos brutos no momento da consulta. Nada acumula. Faca a mesma pergunta duas vezes e o LLM faz o mesmo trabalho duas vezes. Mempunk compila contexto incrementalmente — cada sessao produz um snapshot mais rico e preciso.

**vs notas manuais:** Um wiki que voce escreve funciona — ate que o fardo de manutencao o mate. Atualizar referencias cruzadas entre dezenas de paginas e tedioso. As pessoas abandonam wikis porque o custo de manutencao cresce mais rapido que o valor. Mempunk delega tudo isso ao LLM.

**vs Engram:** Engram usa armazenamento somente em SQLite sem camada legivel por humanos. Mempunk mantem markdown como a camada humana com SQLite como backend estruturado. O vault e portavel, legivel em qualquer editor de texto, e funciona como vault do Obsidian.

## Idiomas

Documentacao disponivel em: **English** (padrao), **Espanol**, **Portugues**, **Francais**

## Licenca

[MIT](LICENSE)
