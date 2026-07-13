[English](README.md) | [Español](README.es.md) | [Português](README.pt.md) | [Français](README.fr.md)

# Mempunk

[![npm version](https://img.shields.io/npm/v/mempunk)](https://www.npmjs.com/package/mempunk)
[![license](https://img.shields.io/npm/l/mempunk)](LICENSE)

Memoire persistante entre les sessions Claude Code.

## Le Probleme

Les CLI d'IA n'ont aucune memoire entre les sessions. A chaque nouvelle conversation, votre assistant ne sait pas:

- Sur quoi vous travailliez hier
- Quelles decisions d'architecture ont deja ete prises
- Quelles taches sont en attente ou terminees
- Quels fichiers ont ete modifies et pourquoi
- Quelles etaient les prochaines etapes
- Quel outil CLI vous utilisiez (Claude Code? opencode? gemini-cli?)

Vous finissez par repeter le contexte, re-expliquer les decisions et perdre l'elan. Plus le projet est long, pire c'est.

Mais il y a un probleme plus profond: meme si un CLI *se souvenait* de tout, l'historique brut est un contexte inefficace. Lire 20 session logs pour comprendre ou en est un projet est presque aussi lent que de repartir de zero. Ce dont vous avez besoin n'est pas un journal — c'est un etat compile qui devient plus precis avec le temps, pas une pile d'entrees qui ne fait que croitre.

De plus, si vous alternez entre differents CLI d'IA — Claude Code pour certains projets, opencode ou gemini-cli pour d'autres — chaque outil vit dans son propre silo. Votre contexte est fragmente entre les outils.

## La Solution

Mempunk donne a votre IA un vault structure adosse a SQLite et des fichiers markdown — et le maintient compile, pas seulement stocke.

- **Debut de session** (`vault-skills/session-start.md`): l'assistant charge l'etat compile du projet depuis `wiki/state.md` s'il existe, ou les derniers session logs sinon. Sans re-expliquer. Sans re-deriver. Il reprend la ou vous vous etiez arrete.
- **Fin de session** (`vault-skills/session-end.md`): l'assistant ecrit le session log, met a jour le backlog et recrit l'etat compile — une synthese fraiche de tout ce qui s'est passe jusqu'ici. La session suivante demarre avec un snapshot dense et precis plutot qu'un historique brut.
- **Le vault** (toujours): chaque projet accumule un `wiki/` — une base de connaissances que le LLM construit et maintient. Chaque session le rend plus precis. Chaque source que vous ajoutez l'enrichit.

Le vault est constitue de fichiers markdown organises par projet, avec SQLite comme backend structure. Vous le gerez avec un CLI. Votre assistant IA le navigue avec les protocoles definis dans `vault-skills/`. Il fonctionne aussi comme vault Obsidian, pour naviguer et chercher tout visuellement.

Comme le vault est agnostique au CLI, vous pouvez utiliser le meme vault avec Claude Code, opencode et gemini-cli simultanement. Changez de CLI sans perdre le contexte.

## Demarrage Rapide

```bash
npm install -g mempunk
mempunk setup
```

`setup` demande quel CLI IA vous utilisez et configure tout: cree `~/Dev-Brain/`, le lie a votre CLI, et installe les hooks + agents (Claude Code) ou les protocoles vault-skills (Gemini CLI / opencode).

## Structure du Vault

```
~/Dev-Brain/
├── projects/
│   └── <id>/
│       ├── INDEX.md        metadonnees (nom, created_at, status)
│       ├── decisions/      architecture decision records (ADRs)
│       ├── skills/         stack, patterns, conventions — charges a chaque session
│       └── wiki/           base de connaissances maintenue par le LLM
│           ├── state.md    etat compile — recrit a chaque session
│           ├── log.md      historique append-only des sessions
│           ├── index.md    catalogue de toutes les pages du wiki
│           └── sources/    documents a faire ingerer par le LLM
├── areas/                  responsabilites continues, pas des projets
├── resources/              liens et references
├── daily/                  logs journaliers narratifs
└── .mempunk/
    ├── mempunk.db          base de donnees SQLite — ne pas modifier manuellement
    └── hooks.log           journal d'execution des hooks du cycle de vie
```

`wiki/state.md` est le differenciateur central. C'est l'*etat compile* du projet — ce qui est vrai maintenant, pas ce qui s'est passe dans l'ordre. Le LLM le recrit a la fin de chaque session. Lire un fichier compile est plus rapide et plus precis que lire N session logs. Chaque session le rend plus precis. Chaque source que vous ajoutez l'enrichit. Vous ne l'ecrivez jamais vous-meme.

## Flux de Session

### Debut de session

**Avec agents (Claude Code, mode automatique):** invoquez `@mempunk-loader`. Il liste vos projets, demande lequel utiliser, l'active et retourne un resume compact du contexte. Si vous avez active `auto-start`, il s'execute automatiquement a l'ouverture de Claude Code.

**Sans agents (mode manuel / Gemini CLI / opencode):** suivez `vault-skills/session-start.md`. L'assistant:

1. Execute `mempunk project activate <id>` pour definir le projet actif
2. Execute `mempunk session last <project_id>` pour savoir ce que la session precedente a fait
3. Execute `mempunk skill list <project_id>` et lit tous les fichiers de skill pertinents
4. Lit l'etat du projet — `wiki/state.md` si existant, sinon les 3 derniers session log entries
5. Execute `mempunk backlog list <project_id> --status pending`
6. Confirme le contexte avant de continuer

### Saves incrementaux (pendant la session)

L'assistant sauvegarde le contexte immediatement quand cela se produit — pas seulement en fin de session:

- **Decision architecturale prise** → `mempunk decision add` immediatement
- **Bug important resolu** → `mempunk session log` avec le resume du correctif
- **Tache completee ou demarree** → `mempunk backlog update` immediatement
- **Skill du projet modifie** → `mempunk skill update` immediatement
- **Lien ou reference pertinente capture** → `mempunk resource add` immediatement
- **Bloc de travail important termine** → `mempunk daily log` avec resume du bloc

Si une session est interrompue, le contexte important est deja persiste.

### Fin de session (`vault-skills/session-end.md`)

Quand une session se termine, l'assistant:

1. Execute `mempunk backlog update` pour chaque tache qui a change de statut pendant la session
2. Execute `mempunk decision add` pour chaque decision importante pas encore sauvegardee
3. Execute `mempunk session log` avec un resume et la liste des fichiers touches
4. Met a jour `wiki/state.md` — le recrit comme synthese compilee de l'etat actuel du projet
5. Ajoute au `wiki/log.md`
6. Cree ou ajoute au `daily/YYYY-MM-DD.md`

La prochaine session reprend exactement la ou celle-ci s'est arretee.

## Hooks du Cycle de Vie (Claude Code)

Quand les hooks sont installes (`mempunk hooks install`), Mempunk repond automatiquement aux evenements de session de Claude Code:

| Hook | Evenement | Comportement |
|------|-----------|-------------|
| `on-prompt.js` | Avant chaque tour | **ContextWarning** — alerte a 70%, 80% et 84% d'utilisation du contexte |
| `on-stop.js` | Apres chaque reponse | **AutoCheckpoint** — sauvegarde un checkpoint incremental tous les 5 tours |
| `on-compact.js` | Avant compaction du contexte | **CompactGuard** — capture un snapshot complet avant que Claude compacte |
| `on-start.js` | Debut de session | **CompactRestore** — restaure le contexte depuis le dernier snapshot apres une compaction |

L'intervalle d'AutoCheckpoint est configurable via la variable d'environnement `MEMPUNK_CHECKPOINT_INTERVAL` (defaut: 5).

Les hooks installent aussi une integration **statusline** — une barre de contexte en temps reel dans la barre de statut de Claude Code:

```
🟢 ███░░░░░░ 32% | claude-sonnet | $0.12
```

L'emoji indique le niveau de pression: 🟢 sous 70%, ⚠️ entre 70–80%, 🔶 entre 80–84%, 🚨 au-dessus de 84%.

Pour recuperer le contexte d'une session precedente ou apres une interruption:

```bash
mempunk session recover <project_id>     # voir le dernier snapshot disponible
mempunk session checkpoints <project_id> # lister tous les checkpoints sauvegardes
```

## Agents (Claude Code)

Trois sous-agents sont installes avec les hooks:

| Agent | Modele | Objectif |
|-------|--------|----------|
| `@mempunk-loader` | Sonnet | Charge le contexte du projet au debut de session — liste les projets, en active un, retourne un resume compact |
| `@mempunk-saver` | Haiku (background) | Sauvegarde decisions, session logs et mises a jour du backlog en cours de session sans interrompre le flux |
| `@mempunk-recover` | Sonnet | Recupere le contexte d'une session fermee ou interrompue manuellement |

`@mempunk-loader` remplace le protocole manuel de debut de session. Si `auto-start` est active (`mempunk auto-start on`), il s'execute automatiquement a chaque ouverture de Claude Code.

`@mempunk-saver` est declenche quand vous ecrivez des commandes de sauvegarde structurees:

```
SAVE decision: project=<id> title="Utiliser JWT pour l'auth"
SAVE session: project=<id> summary="Implemente endpoint de login"
```

## Commandes

### Configuration

| Commande | Description | Exemple |
|----------|-------------|---------|
| `mempunk setup` | Setup interactif: init + link + hooks install | `mempunk setup` |
| `mempunk init` | Creer la structure du vault et initialiser la BD | `mempunk init` |
| `mempunk link [--cli <name>]` | Lier le vault a Claude Code, opencode ou gemini-cli | `mempunk link --cli opencode` |
| `mempunk unlink [--cli <name>]` | Delier d'un CLI | `mempunk unlink` |
| `mempunk status` | Dashboard: vault, projets, backlogs, derniere session | `mempunk status` |
| `mempunk cli list` | Lister les CLI compatibles et leur statut de liaison | `mempunk cli list` |
| `mempunk auto-start on\|off` | Activer/desactiver `@mempunk-loader` automatique au demarrage | `mempunk auto-start on` |

### Projets

| Commande | Description | Exemple |
|----------|-------------|---------|
| `mempunk project add <id> <name> [--path <dir>]` | Enregistrer un nouveau projet (mappe le repertoire courant, ou `--path`, comme son repo) | `mempunk project add api "Backend API"` |
| `mempunk project list` | Lister tous les projets | `mempunk project list` |
| `mempunk vault backup` | Copie verifiee de la base de donnees dans `.mempunk/backups/` (conserve les 10 dernieres) | `mempunk vault backup` |
| `mempunk export [--out <file>]` | Dump JSON portable de toutes les tables du vault | `mempunk export` |
| `mempunk <commande de lecture> --json` | Sortie JSON pour scripts et agents (lists, `session last/checkpoints`, `search`) | `mempunk backlog list api --json` |
| `mempunk project activate <id> [--here]` | Definir le projet actif ; `--here` mappe le repertoire courant pour que les hooks resolvent le projet par cwd | `mempunk project activate api --here` |
| `mempunk log <id>` | Ouvrir l'INDEX.md du projet dans l'editeur | `mempunk log api` |
| `mempunk remove <id> --yes` | Supprimer un projet (BD + disque, irreversible) | `mempunk remove api --yes` |

### Backlog

| Commande | Description | Exemple |
|----------|-------------|---------|
| `mempunk backlog add <project_id> "<title>"` | Ajouter une tache au backlog | `mempunk backlog add api "Ajouter auth"` |
| `mempunk backlog add ... --priority <1\|2\|3>` | Ajouter une tache avec priorite (defaut: 2) | `mempunk backlog add api "Fix CORS" --priority 1` |
| `mempunk backlog list <project_id>` | Lister toutes les taches | `mempunk backlog list api` |
| `mempunk backlog list ... --status <valeur>` | Filtrer par statut | `mempunk backlog list api --status pending` |
| `mempunk backlog update <id> --status <valeur>` | Mettre a jour le statut d'une tache | `mempunk backlog update bl_123 --status done` |
| `mempunk backlog update <id> --priority <valeur>` | Mettre a jour la priorite d'une tache | `mempunk backlog update bl_123 --priority 1` |

### Decisions, Skills et Ressources

| Commande | Description | Exemple |
|----------|-------------|---------|
| `mempunk decision add <project_id> "<title>"` | Creer un ADR avec fichier markdown | `mempunk decision add api "Utiliser JWT"` |
| `mempunk decision add ... --tags "t1,t2"` | Creer une decision avec tags | `mempunk decision add api "JWT" --tags "auth,securite"` |
| `mempunk decision list <project_id>` | Lister les decisions du projet | `mempunk decision list api` |
| `mempunk skill add <project_id> <name>` | Creer un fichier de skill du projet | `mempunk skill add api stack` |
| `mempunk skill list <project_id>` | Lister les skills du projet | `mempunk skill list api` |
| `mempunk skill update <id> --file <path>` | Ecraser le contenu d'un skill | `mempunk skill update sk_123 --file stack.md` |
| `mempunk resource add <project_id> "<title>"` | Capturer une ressource externe | `mempunk resource add api "JWT spec" --url https://jwt.io` |
| `mempunk resource list <project_id>` | Lister les ressources du projet | `mempunk resource list api` |

### Sessions et Logs

| Commande | Description | Exemple |
|----------|-------------|---------|
| `mempunk session log <project_id> "<summary>"` | Enregistrer une session de travail | `mempunk session log api "Implemente endpoint login"` |
| `mempunk session log ... --files "p1,p2"` | Enregistrer session avec fichiers touches | `mempunk session log api "Fix" --files "src/auth.js"` |
| `mempunk session last <project_id>` | Voir la derniere session enregistree | `mempunk session last api` |
| `mempunk session recover <project_id>` | Voir le dernier snapshot disponible (checkpoint ou compact) | `mempunk session recover api` |
| `mempunk session checkpoints <project_id>` | Lister tous les checkpoints et compact snapshots | `mempunk session checkpoints api` |
| `mempunk daily log <project_id> "<content>"` | Ajouter une entree au log journalier | `mempunk daily log api "Termine module auth"` |
| `mempunk daily list <project_id>` | Lister les entrees du log journalier | `mempunk daily list api` |

### Recherche

| Commande | Description | Exemple |
|----------|-------------|---------|
| `mempunk search "<query>"` | Recherche full-text dans le vault | `mempunk search "refresh token"` |
| `mempunk search "<query>" --project <id>` | Recherche dans un seul projet | `mempunk search "auth" --project api` |

### Hooks et Agents

| Commande | Description | Exemple |
|----------|-------------|---------|
| `mempunk hooks install` | Installer hooks + agents globalement dans `~/.claude/` | `mempunk hooks install` |
| `mempunk hooks install --local` | Installer les hooks dans `.claude/` du projet actuel | `mempunk hooks install --local` |
| `mempunk hooks install --check` | Verifier hooks, agents et statusline installes | `mempunk hooks install --check` |
| `mempunk hooks uninstall` | Supprimer les hooks Mempunk | `mempunk hooks uninstall` |

## Maintenance du Vault

```bash
# Verifier la coherence entre les fichiers sur disque et la base de donnees
mempunk sync

# Verifier l'integrite du vault — fichiers manquants, fichiers non enregistres
mempunk doctor

# Afficher la version du schema du vault et la version du CLI
mempunk vault version

# Appliquer les migrations de schema en attente
mempunk vault upgrade
```

`mempunk vault upgrade` est sans risque a tout moment. Il n'applique que les migrations manquantes et ne modifie jamais les donnees existantes.

## Compatibilite

| Feature | Claude Code | opencode | gemini-cli |
|---|:---:|:---:|:---:|
| Lier/delier un vault | ✔ | ✔ | ✔ |
| Multi-vault | ✔ | ✔ | ✔ |
| Protocole debut de session | ✔ | ✔ | ✔ |
| Protocole fin de session | ✔ | ✔ | ✔ |
| Smart Context Check | ✔ | ✔ | ✔ |
| ADRs automatiques | ✔ | ✔ | ✔ |
| Backlog intelligent | ✔ | ✔ | ✔ |
| Daily consolide | ✔ | ✔ | ✔ |
| Capture de connaissances | ✔ | ✔ | ✔ |
| `sync` / `doctor` | ✔ | ✔ | ✔ |
| Wiki (`state.md`) | ✔ | ✔ | ✔ |
| Hooks du cycle de vie (AutoCheckpoint, CompactGuard) | ✔ | ✘ | ✘ |
| Statusline (barre d'utilisation du contexte) | ✔ | ✘ | ✘ |
| Agents (`@mempunk-loader`, `@mempunk-saver`) | ✔ | ✘ | ✘ |
| Multi-CLI simultane | ✔ | ✔ | ✔ |

> Les protocoles de session, ADRs, mises a jour du backlog et logs journaliers sont des features au niveau du vault — ils fonctionnent avec n'importe quel CLI qui lit le `CLAUDE.md` du vault. Les lifecycle hooks et agents necessitent l'infrastructure de sous-agents et de hooks de Claude Code.

## Comparaison

| | Mempunk | RAG / upload de fichiers | Notes manuelles | Engram |
|---|:---:|:---:|:---:|:---:|
| Persiste entre sessions | ✔ | ✘ | ✔ | Partiel |
| Les connaissances s'accumulent | ✔ | ✘ | Selon | ✘ |
| Le LLM fait la maintenance | ✔ | ✔ | ✘ | ✔ |
| Fonctionne hors ligne, sans infrastructure | ✔ | ✘ | ✔ | ✘ |
| Multi-CLI | ✔ | ✘ | ✔ | ✘ |
| Sauvegarde pendant la session | ✔ | ✘ | ✘ | ✘ |
| Survit aux compactions de contexte | ✔ | ✘ | ✘ | ✘ |

**vs RAG / upload de fichiers:** Des outils comme NotebookLM ou l'upload de fichiers de ChatGPT recuperent depuis des documents bruts au moment de la requete. Rien ne s'accumule. Posez la meme question deux fois et le LLM fait le meme travail deux fois. Mempunk compile le contexte incrementalement — chaque session produit un snapshot plus riche et plus precis.

**vs notes manuelles:** Un wiki que vous ecrivez vous-meme fonctionne — jusqu'a ce que le fardeau de maintenance le tue. Mettre a jour les references croisees sur des dizaines de pages est fastidieux. Les gens abandonnent les wikis parce que le cout de maintenance croit plus vite que la valeur. Mempunk delegue tout cela au LLM.

**vs Engram:** Engram utilise un stockage SQLite uniquement sans couche lisible par l'humain. Mempunk conserve le markdown comme couche humaine avec SQLite comme backend structure. Le vault est portable, lisible dans n'importe quel editeur de texte, et fonctionne comme vault Obsidian.

## Langues

Documentation disponible en: **English** (defaut), **Espanol**, **Portugues**, **Francais**

Le CLI parle **anglais par defaut**. Definissez `MEMPUNK_LANG=es` pour une sortie en espagnol.

## Licence

[MIT](LICENSE)
