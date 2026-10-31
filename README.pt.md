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

Como o vault é agnóstico ao CLI, você pode usar o mesmo vault com Claude Code, opencode e Antigravity CLI (pelo servidor MCP) simultaneamente. Alterne entre CLIs sem perder contexto.

## Instalação

**Requisitos:** Node.js 22 ou superior e pelo menos um CLI de IA para programação (Claude Code, opencode ou Antigravity CLI). O Git só é necessário para [sincronizar o vault entre máquinas](README.md#sync-between-machines).

### 1. Instale o CLI

```bash
npm install -g mempunk
mempunk -v
```

### 2. Crie o vault e vincule seu CLI

```bash
mempunk setup
```

`setup` faz duas perguntas:

1. **Qual CLI de IA você usa principalmente?** `1` para Claude Code, `2` para opencode ou outro CLI.
2. **(Só Claude Code) Como o Mempunk deve funcionar?** `1` *Automático* (recomendado) instala hooks, agentes e a status line, e ativa o `auto-start`. `2` *Manual* instala apenas os protocolos vault-skills, que você mesmo segue.

Ele cria `~/Dev-Brain/`, adiciona-o aos diretórios do seu CLI e instala hooks + agentes (Claude Code, automático) ou os protocolos `vault-skills/` (manual, opencode). Executá-lo de novo é seguro: o vault existente é mantido. Defina `MEMPUNK_VAULT` antes de executá-lo para usar outro local.

### 3. Registre seu primeiro projeto

Na raiz do seu repositório:

```bash
cd ~/code/my-api
mempunk project add api "Backend API"
```

O id (`api`) é o que você usa em todos os outros comandos. `project add` mapeia o diretório atual para o projeto, então as sessões abertas ali o resolvem automaticamente. Para um projeto que já existe (outra pasta, outra máquina), vincule a pasta com `mempunk project activate api --here`.

### 4. Conecte o servidor MCP (recomendado)

O servidor MCP dá ao assistente ferramentas tipadas (`get_context`, `save_decision`, `search`…) em vez de comandos de shell. Registre-o uma vez por CLI, como mostrado em [Servidor MCP](#servidor-mcp).

### 5. Verifique a instalação

```bash
mempunk status                # vault, projects, last session
mempunk hooks install --check # Claude Code: hooks, agents and status line
mempunk doctor                # vault integrity
```

Abra uma sessão do seu CLI na pasta do projeto. Com o Claude Code em modo automático, o bloco de contexto já está lá quando a sessão começa.

## Uso

Um dia típico com um projeto:

1. **Abra seu CLI no repositório.** Com `auto-start` ativado, o Claude Code começa com o contexto compilado do projeto (estado, última sessão, backlog pendente, decisões recentes). Caso contrário, digite `/mempunk` ou peça ao assistente para carregar o contexto do Mempunk: ele lista seus projetos e pergunta em qual trabalhar.
2. **Trabalhe normalmente.** O assistente salva conforme as coisas acontecem: uma decisão quando é acordada, uma atualização do backlog quando uma tarefa começa ou termina, um recurso quando você compartilha um link. Você também pode pedir diretamente ("salve isso como decisão", "adicione ao backlog") ou executar os comandos você mesmo:
   ```bash
   mempunk decision add api "Use JWT for auth" --tags "auth"
   mempunk backlog add api "Add refresh tokens" --priority 1
   mempunk search "refresh token" --project api
   ```
3. **Encerre a sessão.** Digite `/session-end` ou diga ao assistente que terminou. Ele registra a sessão, atualiza o backlog e reescreve `wiki/state.md`, para que a próxima sessão comece de um snapshot compilado em vez de histórico bruto.
4. **Vai trocar de máquina?** `mempunk push` antes de sair e `mempunk pull` na outra máquina (ou `mempunk remote set <url> --auto` para que os hooks façam as duas coisas).

Se uma sessão fechar inesperadamente, `mempunk session recover api` mostra o último snapshot automático.

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

**Com agentes (Claude Code, modo automatico):** invoque `@mempunk-loader`. Lista seus projetos, pergunta com qual trabalhar, ativa e retorna um resumo compacto de contexto. Se voce ativou `auto-start` e o diretorio esta vinculado a um projeto (`project activate <id> --here`), a sessao abre com o bloco `mempunk context` desse projeto ja carregado, sem agente nem perguntas.

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

## Hooks do Ciclo de Vida (Claude Code)

Quando os hooks estao instalados (`mempunk hooks install`), o Mempunk responde automaticamente aos eventos de sessao do Claude Code:

| Hook | Evento | Comportamento |
|------|--------|--------------|
| `on-prompt.js` | Antes de cada turno | Sem ação por enquanto — o uso de contexto é mostrado apenas na status line (a Fase 3 o usará para contar turnos) |
| `on-stop.js` | Apos cada resposta | **AutoCheckpoint** — salva um checkpoint incremental a cada 5 turnos |
| `on-compact.js` | Antes da compactacao de contexto | **CompactGuard** — captura um snapshot completo antes que o Claude compacte |
| `on-start.js` | Inicio de sessao | **CompactRestore** — restaura o contexto do ultimo snapshot apos uma compactacao |

O intervalo do AutoCheckpoint pode ser configurado com a variavel de ambiente `MEMPUNK_CHECKPOINT_INTERVAL` (padrao: 5).

Os hooks tambem instalam uma integracao de **statusline** — uma barra de contexto em tempo real na barra de status do Claude Code:

```
🟢 ███░░░░░░ 32% | claude-sonnet | $0.12
```

O emoji indica o nivel de pressao: 🟢 abaixo de 70%, ⚠️ em 70–80%, 🔶 em 80–84%, 🚨 acima de 84%.

Para recuperar contexto de uma sessao anterior ou apos uma interrupcao:

```bash
mempunk session recover <project_id>     # ver o ultimo snapshot disponivel
mempunk session checkpoints <project_id> # listar todos os checkpoints salvos
```

## Agentes (Claude Code)

Tres sub-agentes sao instalados junto com os hooks:

| Agente | Modelo | Proposito |
|--------|--------|-----------|
| `@mempunk-loader` | Sonnet | Carrega o contexto do projeto no inicio da sessao — lista projetos, ativa um, retorna resumo compacto |
| `@mempunk-saver` | Haiku (background) | Salva decisoes, session logs e atualizacoes de backlog durante a sessao sem interromper o fluxo |
| `@mempunk-recover` | Sonnet | Recupera o contexto de uma sessao fechada ou interrompida manualmente |

`@mempunk-loader` substitui o protocolo manual de inicio de sessao. Com `auto-start` ativado (`mempunk auto-start on`), o SessionStart injeta `mempunk context` do projeto vinculado ao diretorio atual; um diretorio nao vinculado recebe um aviso de uma linha para usar `/mempunk`, e o loader so e invocado como reserva se o CLI falhar.

`@mempunk-saver` e ativado quando voce escreve comandos de salvamento estruturados:

```
SAVE decision: project=<id> title="Usar JWT para auth"
SAVE session: project=<id> summary="Implementei endpoint de login"
```

## Servidor MCP

`mempunk mcp` e um servidor MCP local via stdio: cada CLI de IA o inicia como subprocesso ao abrir a sessao. Sem rede nem hospedagem. Ele expoe o vault como ferramentas tipadas, sobre o mesmo codigo do CLI:

| Ferramenta | Para |
|------------|------|
| `get_context` | Carregar o contexto compilado do projeto (estado, ultima sessao, backlog pendente, decisoes) |
| `save_decision` | Salvar um ADR assim que uma decisao tecnica e acordada |
| `log_session` | Registrar o resumo da sessao com os arquivos tocados |
| `backlog_list` / `backlog_add` / `backlog_update` | Ler e alterar tarefas do backlog |
| `search` | Busca full-text em decisoes, resources e logs diarios |
| `update_state` | Reescrever `wiki/state.md` (o estado anterior vai para o historico) |

`project_id` e opcional: por padrao o servidor usa o projeto vinculado ao diretorio da sessao (`mempunk project activate <id> --here`) ou `CLAUDE_PROJECT_ID`. Nunca recorre ao projeto ativo global; sem vinculo, a ferramenta retorna um erro pedindo `project_id`. Push e pull nao sao expostos.

Registre-o uma vez por CLI. No macOS e no Linux o comando é `mempunk mcp`. **No Windows**, inicie o script com `node`: os CLIs iniciam o servidor sem shell, e o shim `mempunk` (ou `cmd /c mempunk mcp`) falha ou excede o tempo limite. Encontre o caminho do script com `npm root -g`; ele é `<npm root -g>/mempunk/src/cli.js` (por exemplo `C:/Users/<you>/AppData/Roaming/npm/node_modules/mempunk/src/cli.js`). Abaixo, `<cli.js>` representa esse caminho.

- **Claude Code:**
  ```bash
  claude mcp add --scope user mempunk -- mempunk mcp            # macOS / Linux
  claude mcp add --scope user mempunk -- node <cli.js> mcp      # Windows
  ```
  Verifique com `claude mcp list` (`mempunk: … ✔ Connected`) ou `/mcp` dentro de uma sessão. A partir da v2.5, o plugin o declara por você.
- **opencode** (esquema de configuração v2, servidores em `mcp.servers`):
  ```bash
  opencode mcp add --global mempunk -- mempunk mcp              # macOS / Linux
  opencode mcp add --global mempunk -- node <cli.js> mcp        # Windows
  ```
  Isso grava `~/.config/opencode/opencode.jsonc`:
  ```jsonc
  { "mcp": { "servers": { "mempunk": { "type": "local", "command": ["node", "<cli.js>", "mcp"] } } } }
  ```
  Verifique a partir de uma pasta de projeto com `opencode mcp list` (`✓ mempunk connected`), ou `/mcps` dentro de uma sessão. O opencode 1.x usava `"mcp": { "mempunk": { …, "enabled": true } }`.
- **Antigravity CLI (`agy`):**
  ```bash
  agy mcp add mempunk mempunk mcp                               # macOS / Linux
  agy mcp add mempunk node <cli.js> mcp                         # Windows
  ```
  Isso grava `~/.gemini/config/mcp_config.json` (`mcpServers.mempunk`). Reinicie o `agy` e abra `/mcp`. No modo print (`agy -p`), as chamadas MCP precisam de uma regra de permissão como `mcp(*)` em `permissions.allow`. Por enquanto o Antigravity só recebe o servidor MCP: `setup` e `link` ainda não o configuram.
- **Gemini CLI** (sem manutenção upstream; prefira o Antigravity CLI): adicione `{ "mcpServers": { "mempunk": { "command": "mempunk", "args": ["mcp"] } } }` a `~/.gemini/settings.json`. O Gemini descarta as variáveis de ambiente que você não lista: com um vault próprio, adicione `"env": { "MEMPUNK_VAULT": "$MEMPUNK_VAULT" }`.

O servidor resolve o projeto a partir do diretório em que o CLI foi aberto, então abra a sessão dentro de um repositório vinculado ou passe `project_id`. O [MCP Inspector](https://github.com/modelcontextprotocol/inspector) é útil para testar as ferramentas sem um CLI: `npx @modelcontextprotocol/inspector node <cli.js> mcp`, depois *Tools → List Tools*.

Se o vault precisar de `mempunk vault upgrade`, as ferramentas retornam esse erro em vez de migrar.

## Comandos

### Configuracao

| Comando | Descricao | Exemplo |
|---------|-----------|---------|
| `mempunk setup` | Setup interativo: init + link + hooks install | `mempunk setup` |
| `mempunk init` | Criar estrutura do vault e inicializar BD | `mempunk init` |
| `mempunk link [--cli <name>]` | Vincular vault ao Claude Code, opencode ou gemini-cli | `mempunk link --cli opencode` |
| `mempunk unlink [--cli <name>]` | Desvincular de um CLI | `mempunk unlink` |
| `mempunk status` | Dashboard: vault, projetos, backlogs, ultima sessao | `mempunk status` |
| `mempunk cli list` | Listar CLIs compativeis e seu status de vinculacao | `mempunk cli list` |
| `mempunk auto-start on\|off` | Ativar/desativar o carregamento do contexto do projeto vinculado no inicio | `mempunk auto-start on` |

### Projetos

| Comando | Descricao | Exemplo |
|---------|-----------|---------|
| `mempunk project add <id> <name> [--path <dir>]` | Registrar um projeto novo (mapeia o diretorio atual, ou `--path`, como seu repo) | `mempunk project add api "Backend API"` |
| `mempunk project list` | Listar todos os projetos | `mempunk project list` |
| `mempunk vault backup` | Copia verificada do banco de dados em `.mempunk/backups/` (mantem as ultimas 10) | `mempunk vault backup` |
| `mempunk export [--out <file>]` | Dump JSON portavel de todas as tabelas do vault | `mempunk export` |
| `mempunk <comando de leitura> --json` | Saida JSON para scripts e agentes (lists, `session last/checkpoints`, `search`) | `mempunk backlog list api --json` |
| `mempunk project activate <id> [--here]` | Definir o projeto ativo; `--here` mapeia o diretorio atual para que os hooks resolvam o projeto por cwd | `mempunk project activate api --here` |
| `mempunk log <id>` | Abrir INDEX.md do projeto no editor | `mempunk log api` |
| `mempunk remove <id> --yes` | Deletar um projeto (BD + disco, irreversivel) | `mempunk remove api --yes` |

### Backlog

| Comando | Descricao | Exemplo |
|---------|-----------|---------|
| `mempunk backlog add <project_id> "<title>"` | Adicionar tarefa ao backlog | `mempunk backlog add api "Adicionar auth"` |
| `mempunk backlog add ... --priority <1\|2\|3>` | Adicionar tarefa com prioridade (padrao: 2) | `mempunk backlog add api "Fix CORS" --priority 1` |
| `mempunk backlog list <project_id>` | Listar todas as tarefas | `mempunk backlog list api` |
| `mempunk backlog list ... --status <valor>` | Filtrar por status | `mempunk backlog list api --status pending` |
| `mempunk backlog update <id> --status <valor>` | Atualizar status da tarefa | `mempunk backlog update bl_123 --status done` |
| `mempunk backlog update <id> --priority <valor>` | Atualizar prioridade da tarefa | `mempunk backlog update bl_123 --priority 1` |

### Decisoes, Skills e Recursos

| Comando | Descricao | Exemplo |
|---------|-----------|---------|
| `mempunk decision add <project_id> "<title>"` | Criar um ADR com arquivo markdown | `mempunk decision add api "Usar JWT"` |
| `mempunk decision add ... --tags "t1,t2"` | Criar decisao com tags | `mempunk decision add api "JWT" --tags "auth,seguranca"` |
| `mempunk decision list <project_id>` | Listar decisoes do projeto | `mempunk decision list api` |
| `mempunk skill add <project_id> <name>` | Criar arquivo de skill do projeto | `mempunk skill add api stack` |
| `mempunk skill list <project_id>` | Listar skills do projeto | `mempunk skill list api` |
| `mempunk skill update <id> --file <path>` | Sobrescrever conteudo do skill | `mempunk skill update sk_123 --file stack.md` |
| `mempunk resource add <project_id> "<title>"` | Capturar um recurso externo | `mempunk resource add api "JWT spec" --url https://jwt.io` |
| `mempunk resource list <project_id>` | Listar recursos do projeto | `mempunk resource list api` |

### Sessoes e Logs

| Comando | Descricao | Exemplo |
|---------|-----------|---------|
| `mempunk session log <project_id> "<summary>"` | Registrar sessao de trabalho | `mempunk session log api "Implementei endpoint de login"` |
| `mempunk session log ... --files "p1,p2"` | Registrar sessao com arquivos tocados | `mempunk session log api "Fix" --files "src/auth.js"` |
| `mempunk session last <project_id>` | Ver a ultima sessao registrada | `mempunk session last api` |
| `mempunk session recover <project_id>` | Ver o ultimo snapshot disponivel (checkpoint ou compact) | `mempunk session recover api` |
| `mempunk session checkpoints <project_id>` | Listar todos os checkpoints e compact snapshots | `mempunk session checkpoints api` |
| `mempunk daily log <project_id> "<content>"` | Adicionar entrada ao log diario | `mempunk daily log api "Terminei modulo de auth"` |
| `mempunk daily list <project_id>` | Listar entradas do log diario | `mempunk daily list api` |

### Busca

| Comando | Descricao | Exemplo |
|---------|-----------|---------|
| `mempunk search "<query>"` | Busca full-text no vault | `mempunk search "refresh token"` |
| `mempunk search "<query>" --project <id>` | Busca dentro de um projeto | `mempunk search "auth" --project api` |

### Hooks e Agentes

| Comando | Descricao | Exemplo |
|---------|-----------|---------|
| `mempunk hooks install` | Instalar hooks + agentes globalmente em `~/.claude/` | `mempunk hooks install` |
| `mempunk hooks install --local` | Instalar hooks em `.claude/` do projeto atual | `mempunk hooks install --local` |
| `mempunk hooks install --check` | Verificar hooks, agentes e statusline instalados | `mempunk hooks install --check` |
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
| Hooks do ciclo de vida (AutoCheckpoint, CompactGuard) | ✔ | ✘ | ✘ |
| Statusline (barra de uso de contexto) | ✔ | ✘ | ✘ |
| Agentes (`@mempunk-loader`, `@mempunk-saver`) | ✔ | ✘ | ✘ |
| Multi-CLI simultaneo | ✔ | ✔ | ✔ |
| Servidor MCP (`mempunk mcp`) | ✔ | ✔ | ✔ |

> Protocolos de sessao, ADRs, atualizacoes de backlog e logs diarios sao features a nivel de vault — funcionam em qualquer CLI que leia o `CLAUDE.md` do vault. Lifecycle hooks e agentes requerem a infraestrutura de sub-agentes e hooks do Claude Code.
>
> O Gemini CLI não recebe mais atualizações upstream; seu sucessor, o Antigravity CLI, já funciona hoje pelo [servidor MCP](#servidor-mcp). A vinculação com `setup`/`link` está planejada.

## Como se Compara

| | Mempunk | RAG / upload de arquivos | Notas manuais | Engram |
|---|:---:|:---:|:---:|:---:|
| Persiste entre sessoes | ✔ | ✘ | ✔ | Parcial |
| Conhecimento acumula | ✔ | ✘ | Depende | ✘ |
| LLM faz a manutencao | ✔ | ✔ | ✘ | ✔ |
| Funciona offline, sem infraestrutura | ✔ | ✘ | ✔ | ✘ |
| Multi-CLI | ✔ | ✘ | ✔ | ✘ |
| Salva contexto durante a sessao | ✔ | ✘ | ✘ | ✘ |
| Sobrevive compactacoes de contexto | ✔ | ✘ | ✘ | ✘ |

**vs RAG / upload de arquivos:** Ferramentas como NotebookLM ou upload de arquivos do ChatGPT recuperam de documentos brutos no momento da consulta. Nada acumula. Faca a mesma pergunta duas vezes e o LLM faz o mesmo trabalho duas vezes. Mempunk compila contexto incrementalmente — cada sessao produz um snapshot mais rico e preciso.

**vs notas manuais:** Um wiki que voce escreve funciona — ate que o fardo de manutencao o mate. Atualizar referencias cruzadas entre dezenas de paginas e tedioso. As pessoas abandonam wikis porque o custo de manutencao cresce mais rapido que o valor. Mempunk delega tudo isso ao LLM.

**vs Engram:** Engram usa armazenamento somente em SQLite sem camada legivel por humanos. Mempunk mantem markdown como a camada humana com SQLite como backend estruturado. O vault e portavel, legivel em qualquer editor de texto, e funciona como vault do Obsidian.

## Idiomas

Documentacao disponivel em: **English** (padrao), **Espanol**, **Portugues**, **Francais**

O CLI fala **ingles por padrao**. Configure `MEMPUNK_LANG=es` para saida em espanhol.

## Licenca

[MIT](LICENSE)
