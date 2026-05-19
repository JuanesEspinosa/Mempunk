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
mempunk init
mempunk hooks install   # optionnel: saves automatiques a la compaction
```

`init` cree `~/Dev-Brain/` avec la structure complete du vault et initialise la base de donnees SQLite.

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

### Debut de session (`vault-skills/session-start.md`)

Quand une nouvelle session commence, l'assistant:

1. Execute `mempunk session last <project_id>` pour savoir ce que la session precedente a fait
2. Execute `mempunk skill list <project_id>` et lit tous les fichiers de skill pertinents — stack, patterns, conventions
3. Lit l'etat du projet — si `wiki/state.md` existe, le lit (etat compile); sinon lit les 3 derniers session log entries
4. Execute `mempunk backlog list <project_id> --status pending` pour charger les taches en attente
5. **Smart Context Check** — detecte les lacunes (session log perime, skills vides, wiki state absent) et propose de lire le repo reel si necessaire
6. Confirme le contexte avant de continuer

Si les hooks sont installes (`mempunk hooks install`), les etapes 1–4 s'executent automatiquement au debut de la session.

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

## Commandes

| Commande | Description | Exemple |
|----------|-------------|---------|
| `mempunk init` | Creer la structure du vault et initialiser la BD | `mempunk init` |
| `mempunk project add <id> <name>` | Enregistrer un nouveau projet | `mempunk project add api "Backend API"` |
| `mempunk project list` | Lister tous les projets | `mempunk project list` |
| `mempunk backlog add <project_id> "<title>"` | Ajouter une tache au backlog | `mempunk backlog add api "Ajouter auth"` |
| `mempunk backlog add ... --priority <1\|2\|3>` | Ajouter une tache avec priorite (defaut: 2) | `mempunk backlog add api "Fix CORS" --priority 1` |
| `mempunk backlog list <project_id>` | Lister toutes les taches | `mempunk backlog list api` |
| `mempunk backlog list ... --status <valeur>` | Filtrer par statut | `mempunk backlog list api --status pending` |
| `mempunk backlog update <id> --status <valeur>` | Mettre a jour le statut d'une tache | `mempunk backlog update bl_123 --status done` |
| `mempunk backlog update <id> --priority <valeur>` | Mettre a jour la priorite d'une tache | `mempunk backlog update bl_123 --priority 1` |
| `mempunk decision add <project_id> "<title>"` | Creer un ADR avec fichier markdown | `mempunk decision add api "Utiliser JWT"` |
| `mempunk decision add ... --tags "t1,t2"` | Creer une decision avec tags | `mempunk decision add api "JWT" --tags "auth,securite"` |
| `mempunk decision list <project_id>` | Lister les decisions du projet | `mempunk decision list api` |
| `mempunk skill add <project_id> <name>` | Creer un fichier de skill du projet | `mempunk skill add api stack` |
| `mempunk skill list <project_id>` | Lister les skills du projet | `mempunk skill list api` |
| `mempunk skill update <id> --file <path>` | Ecraser le contenu d'un skill | `mempunk skill update sk_123 --file stack.md` |
| `mempunk resource add <project_id> "<title>"` | Capturer une ressource externe | `mempunk resource add api "JWT spec" --url https://jwt.io` |
| `mempunk resource list <project_id>` | Lister les ressources du projet | `mempunk resource list api` |
| `mempunk daily log <project_id> "<content>"` | Ajouter une entree au log journalier | `mempunk daily log api "Termine module auth"` |
| `mempunk daily list <project_id>` | Lister les entrees du log journalier | `mempunk daily list api` |
| `mempunk session log <project_id> "<summary>"` | Enregistrer une session de travail | `mempunk session log api "Implemente endpoint login"` |
| `mempunk session log ... --files "p1,p2"` | Enregistrer session avec fichiers touches | `mempunk session log api "Fix" --files "src/auth.js"` |
| `mempunk session last <project_id>` | Voir la derniere session enregistree | `mempunk session last api` |
| `mempunk search "<query>"` | Recherche full-text dans le vault | `mempunk search "refresh token"` |
| `mempunk search "<query>" --project <id>` | Recherche dans un seul projet | `mempunk search "auth" --project api` |
| `mempunk sync` | Verifier la coherence disque ↔ BD | `mempunk sync` |
| `mempunk sync --project <id>` | Sync limite a un projet | `mempunk sync --project api` |
| `mempunk hooks install` | Installer les hooks dans `.claude/hooks/` | `mempunk hooks install` |
| `mempunk hooks install --global` | Installer les hooks globalement | `mempunk hooks install --global` |
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
| Hooks (`hooks install`) | ✔ | ✘ | ✔ |
| Multi-CLI simultane | ✔ | ✔ | ✔ |

> Les protocoles de session, ADRs, mises a jour du backlog et logs journaliers sont des features au niveau du vault — ils fonctionnent avec n'importe quel CLI qui lit le `CLAUDE.md` du vault. Les lifecycle hooks necessitent la prise en charge des evenements de session, que opencode ne fournit pas.

## Comparaison

| | Mempunk | RAG / upload de fichiers | Notes manuelles | Engram |
|---|:---:|:---:|:---:|:---:|
| Persiste entre sessions | ✔ | ✘ | ✔ | Partiel |
| Les connaissances s'accumulent | ✔ | ✘ | Selon | ✘ |
| Le LLM fait la maintenance | ✔ | ✔ | ✘ | ✔ |
| Fonctionne hors ligne, sans infrastructure | ✔ | ✘ | ✔ | ✘ |
| Multi-CLI | ✔ | ✘ | ✔ | ✘ |

**vs RAG / upload de fichiers:** Des outils comme NotebookLM ou l'upload de fichiers de ChatGPT recuperent depuis des documents bruts au moment de la requete. Rien ne s'accumule. Posez la meme question deux fois et le LLM fait le meme travail deux fois. Mempunk compile le contexte incrementalement — chaque session produit un snapshot plus riche et plus precis.

**vs notes manuelles:** Un wiki que vous ecrivez vous-meme fonctionne — jusqu'a ce que le fardeau de maintenance le tue. Mettre a jour les references croisees sur des dizaines de pages est fastidieux. Les gens abandonnent les wikis parce que le cout de maintenance croit plus vite que la valeur. Mempunk delegue tout cela au LLM.

**vs Engram:** Engram utilise un stockage SQLite uniquement sans couche lisible par l'humain. Mempunk conserve le markdown comme couche humaine avec SQLite comme backend structure. Le vault est portable, lisible dans n'importe quel editeur de texte, et fonctionne comme vault Obsidian.

## Langues

Disponibles: **English** (defaut), **Espanol**, **Portugues**, **Francais**

Utilisez `--lang es`, `--lang pt` ou `--lang fr` avec n'importe quelle commande, ou selectionnez interactivement lors du setup.

## Licence

[MIT](LICENSE)
