[English](README.md) | [Español](README.es.md) | [Português](README.pt.md) | [Français](README.fr.md)

# Mempunk

[![npm version](https://img.shields.io/npm/v/mempunk)](https://www.npmjs.com/package/mempunk)
[![license](https://img.shields.io/npm/l/mempunk)](LICENSE)

Cerveau persistant pour les CLI d'IA — un vault markdown qui survit entre les sessions. Compatible avec **Claude Code**, **opencode** et **gemini-cli**.

## Le Probleme

Les CLI d'IA n'ont aucune memoire entre les sessions. A chaque nouvelle conversation, votre assistant ne sait pas:

- Sur quoi vous travailliez hier
- Quelles decisions d'architecture ont deja ete prises
- Quelles taches sont en attente ou terminees
- Quels fichiers ont ete modifies et pourquoi
- Quelles etaient les prochaines etapes
- Quel outil CLI vous utilisiez (Claude Code? opencode? gemini-cli?)

Vous finissez par repeter le contexte, re-expliquer les decisions et perdre l'elan. Plus le projet est long, pire c'est.

De plus, si vous alternez entre differents CLI d'IA — Claude Code pour certains projets, opencode ou gemini-cli pour d'autres — chaque outil vit dans son propre silo. Votre contexte est fragmente entre les outils.

## La Solution

Mempunk est un vault markdown structure qui sert de memoire persistante a votre assistant. Il fonctionne en deux temps:

- **Debut de session** (`/mempunk`): l'assistant lit le vault, voit vos projets, charge l'overview pertinent, les conventions, les derniers session logs et le backlog. Il reprend la ou vous vous etiez arrete.
- **Fin de session** (`/session-end`): l'assistant ecrit ce qu'il a fait, les decisions prises, ce qui reste et les fichiers touches. La session suivante demarre avec le contexte complet.

Le vault est constitue de fichiers markdown organises par projet. Vous le gerez avec un CLI. Votre assistant IA le navigue avec des slash commands. Il fonctionne aussi comme vault Obsidian, pour naviguer et chercher visuellement.

Pas de base de donnees. Pas de serveur. Pas de cles API. Juste des fichiers.

Et comme le vault est agnostique au CLI, vous pouvez utiliser le meme vault avec Claude Code, opencode et gemini-cli simultanement. Changez de CLI sans perdre le contexte.

## Demarrage Rapide

```bash
# 1. Lancez le setup (demande quel CLI vous utiliserez, cree et lie un vault)
npx mempunk

# 2. Ajouter un projet
npx mempunk project mon-app

# 3. Dans n'importe quelle session de votre CLI, tapez:
/mempunk

# 4. Quand vous avez fini, tapez:
/session-end
```

## Reference du CLI

### Gestion du vault

```
mempunk setup                  Configuration interactive complete (recommande)
mempunk init [chemin] [options] Creer un nouveau vault
mempunk link <chemin>          Lier un vault a votre CLI (supporte plusieurs)
mempunk unlink [chemin]        Dissocier un vault (interactif si plusieurs)
mempunk status                 Afficher tous les vaults lies et leurs projets
mempunk cli add <nom>          Ajouter un CLI (claude-code, opencode, gemini-cli)
mempunk cli remove <nom>       Supprimer un CLI
mempunk cli list               Afficher les CLIs actifs
mempunk auto-start [on|off]    Auto-executer /mempunk dans nouvelles sessions
mempunk -v                     Afficher la version
```

### Gestion des projets

```
mempunk project <nom>          Ajouter un nouveau projet au vault
mempunk remove <nom>           Supprimer un projet du vault
mempunk backlog <nom>          Voir le backlog d'un projet dans le terminal
mempunk log <nom>              Ouvrir le session log dans votre editeur
mempunk sync                   Ajouter les fichiers manquants aux projets existants
mempunk doctor                 Verifier la sante et l'integrite du vault
```

> Toutes les commandes de projet demandent quel vault utiliser quand plusieurs sont lies.

### Options

```
--lang <code>      Langue: en, es, pt, fr (defaut: en)
--preset <nom>     Preset: full, standard, minimal
--projects         Inclure le dossier projects
--areas            Inclure le dossier areas
--resources        Inclure le dossier resources
--daily            Inclure le dossier daily
```

### Exemples

```bash
mempunk setup --lang fr
mempunk init ./vault --preset full
mempunk init ./vault --projects --resources --daily
mempunk project mon-saas
mempunk remove mon-saas
mempunk backlog mon-saas
mempunk log mon-saas
mempunk sync
mempunk doctor
mempunk status
mempunk cli add opencode
mempunk cli add gemini-cli
mempunk cli list
mempunk cli remove opencode
```

## Structure du Vault

```
vault/
├── CLAUDE.md              # Point d'entree — Claude lit ceci en premier
├── projects/
│   └── mon-projet/
│       ├── INDEX.md       # Entree rapide — statut, top 3 backlog, liens
│       ├── overview.md    # Ce qu'est le projet, stack, repo, statut
│       ├── architecture.md # Decisions techniques et diagrammes
│       ├── conventions.md # Regles du projet, standards de code, patterns
│       ├── backlog.md     # Taches priorisees (- [ ] / - [x])
│       ├── session-log.md # Ce que Claude a fait a chaque session
│       └── decisions/     # Architecture Decision Records
├── areas/                 # Responsabilites continues (pas des projets)
│   └── INDEX.md           # Index des areas
├── resources/             # Connaissances techniques reutilisables
│   └── INDEX.md           # Index des ressources par categorie
└── daily/                 # Logs journaliers consolides
    └── INDEX.md           # Index des logs journaliers
```

`CLAUDE.md` lie directement au `INDEX.md` de chaque projet — jamais aux fichiers internes. Chaque `INDEX.md` lie aux fichiers internes du projet. Cela garde le graphe Obsidian propre (arbre, pas toile d'araignee).

`mempunk project <nom>` cree cette structure et enregistre le projet dans `CLAUDE.md` avec un `[[wikilink]]` direct vers son `INDEX.md`.

`mempunk sync` ajoute les fichiers de template manquants (comme `INDEX.md`, `conventions.md`) aux projets existants sans ecraser.

## CLI Supportes

mempunk supporte l'utilisation de plusieurs CLI simultanement avec le meme vault. Durant `setup`, selectionnez un ou plusieurs CLI. Vous pouvez en ajouter d'autres avec `mempunk cli add <nom>`. Chaque CLI utilise son propre mecanisme natif:

| CLI | Enregistrement du vault | Emplacement des skills |
|---|---|---|
| **Claude Code** | `~/.claude.json` → `additionalDirectories[]` | `~/.claude/skills/<name>/SKILL.md` |
| **opencode** | `~/.config/opencode/AGENTS.md` (marqueurs) | `~/.config/opencode/skills/<name>/SKILL.md` |
| **gemini-cli** | `~/.gemini/settings.json` → `context.includeDirectories[]` | `~/.gemini/skills/<name>/SKILL.md` |

Le vault lui-meme (fichiers markdown dans `projects/`, `daily/`, etc.) est le meme quel que soit le CLI — il est portable. Quand vous faites `link` ou `unlink` d'un vault, l'operation s'applique a tous les CLI actifs en meme temps. Vos CLI actifs sont sauvegardes dans `~/.mempunk/config.json`.

### Compatibilite des features

| Feature | Claude Code | opencode | gemini-cli |
|---|:---:|:---:|:---:|
| Lier/delier un vault | ✔ | ✔ | ✔ |
| Multi-vault | ✔ | ✔ | ✔ |
| Skill `/mempunk` | ✔ | ✔ | ✔ |
| Skill `/session-end` | ✔ | ✔ | ✔ |
| Smart Context Check | ✔ | ✔ | ✔ |
| ADRs automatiques | ✔ | ✔ | ✔ |
| Backlog intelligent | ✔ | ✔ | ✔ |
| Daily consolide | ✔ | ✔ | ✔ |
| Capture de connaissances | ✔ | ✔ | ✔ |
| `sync` / `doctor` | ✔ | ✔ | ✔ |
| Auto-start | ✔ | ✘ | ✔ |
| Multi-CLI simultane | ✔ | ✔ | ✔ |

> Les skills, ADRs, mises a jour du backlog et logs journaliers sont des features au niveau du vault — ils fonctionnent avec n'importe quel CLI qui lit le `CLAUDE.md` du vault. Auto-start necessite des hooks de session, que opencode ne supporte pas.

## Flux de Session

### Debut: `/mempunk`

Installe globalement pendant le setup au chemin de skills que votre CLI utilise (voir tableau ci-dessus). En tapant `/mempunk`, l'assistant:

1. Decouvre tous les vaults lies automatiquement
2. S'il y a plusieurs vaults, demande lequel utiliser
3. Lit le `CLAUDE.md` du vault et liste les projets disponibles
4. Demande sur quel projet vous voulez travailler — ne suppose jamais
5. Lit le `INDEX.md`, `overview.md` et `conventions.md` du projet
6. Lit les 3 derniers session logs et le backlog
7. **Smart Context Check** — detecte les lacunes (session-log ancien, overview vide, architecture non definie, backlog vide) et propose de lire le repo reel si necessaire
8. Confirme le contexte avant de continuer

### Fin: `/session-end`

Installe avec `/mempunk`. En tapant `/session-end`, l'assistant:

1. Ecrit une entree structuree dans le `session-log.md` du projet
2. **Met a jour le backlog** — marque les taches completees, ajoute les nouvelles, reordonne par priorite
3. **Met a jour INDEX.md** — reflete la derniere session et le top 3 du backlog
4. **Ecrit le log journalier** — cree ou met a jour `daily/YYYY-MM-DD.md` avec un resume consolide
5. Note les conventions qui ont ete etablies ou modifiees
6. Confirme ce qui a ete enregistre

La prochaine session reprend exactement la ou celle-ci s'est arretee.

### Skills automatiques

Le `CLAUDE.md` du vault inclut des regles que l'assistant suit automatiquement pendant toute session:

- **ADRs automatiques** — Quand une decision technique est prise (architecture, stack, patterns), un ADR est cree dans `decisions/` sans etre demande
- **Capture de connaissances** — Quand un probleme technique reutilisable est resolu, la solution est sauvegardee dans `resources/` par categorie
- **Contexte des areas** — Quand l'utilisateur pose une question sur l'universite ou l'infrastructure, l'assistant lit l'INDEX de l'area correspondante d'abord

## Maintenance du Vault

```bash
# Ajouter les fichiers manquants aux projets existants apres une mise a jour de mempunk
mempunk sync

# Verifier l'integrite — projets fantomes, fichiers manquants, enregistrements casses
mempunk doctor
```

## Plusieurs Vaults

Vous pouvez lier plusieurs vaults et basculer entre eux au debut de la session:

```bash
mempunk link ./vault-travail
mempunk link ./vault-perso

# /mempunk demandera quel vault utiliser

mempunk unlink ./vault-perso      # Dissocier un vault specifique
mempunk unlink                    # Selection interactive si plusieurs
mempunk status                    # Affiche tous les vaults lies
```

## Plusieurs CLI

Utilisez le meme vault avec differents CLI d'IA en meme temps:

```bash
# Ajouter un deuxieme CLI
mempunk cli add opencode

# Ajouter un troisieme
mempunk cli add gemini-cli

# link/unlink enregistre maintenant dans tous les CLI actifs en meme temps
mempunk link ./mon-vault    # Enregistre dans Claude Code, opencode ET gemini-cli

# Voir quels CLI sont actifs
mempunk cli list

# Supprimer un
mempunk cli remove gemini-cli
```

`doctor` verifie les skills pour tous les CLI actifs. `status` agrege les vaults de tous les CLI.

## Auto-start

Chargez automatiquement le contexte du vault au debut de chaque nouvelle session Claude Code:

```bash
# Activer
mempunk auto-start on

# Desactiver
mempunk auto-start off

# Voir le statut
mempunk auto-start
```

Cela installe un hook `SessionStart` dans le `settings.json` du CLI. Lorsqu'il est active, `/mempunk` s'execute automatiquement a chaque nouvelle session — pas besoin de le taper manuellement. Si plusieurs CLI supportes sont actifs, la commande demande lequel configurer.

> **Note:** Auto-start est disponible pour **Claude Code** et **gemini-cli**. opencode ne supporte pas les hooks de session. Si vous dissociez tous les vaults, les hooks sont automatiquement supprimes.

## Compatible Obsidian

Tous les fichiers utilisent des `[[wikilinks]]`. Ouvrez le vault dans Obsidian et la vue graphe montre les connexions entre `CLAUDE.md`, overviews, backlogs, docs d'architecture, conventions et session logs.

## Langues

Disponibles: **English** (defaut), **Espanol**, **Portugues**, **Francais**

Utilisez `--lang es`, `--lang pt` ou `--lang fr` avec n'importe quelle commande, ou selectionnez interactivement lors du setup.

## Licence

[MIT](LICENSE)
