[English](README.md) | [Español](README.es.md) | [Português](README.pt.md) | [Français](README.fr.md)

# Mempunk

[![npm version](https://img.shields.io/npm/v/mempunk)](https://www.npmjs.com/package/mempunk)
[![license](https://img.shields.io/npm/l/mempunk)](LICENSE)

Cerveau persistant pour Claude Code — un vault markdown qui survit entre les sessions.

## Le Probleme

Claude Code n'a aucune memoire entre les sessions. A chaque nouvelle conversation, il ne sait pas:

- Sur quoi vous travailliez hier
- Quelles decisions d'architecture ont deja ete prises
- Quelles taches sont en attente ou terminees
- Quels fichiers ont ete modifies et pourquoi
- Quelles etaient les prochaines etapes

Vous finissez par repeter le contexte, re-expliquer les decisions et perdre l'elan. Plus le projet est long, pire c'est.

## La Solution

Mempunk est un vault markdown structure qui sert de memoire persistante a Claude. Il fonctionne en deux temps:

- **Debut de session** (`/mempunk`): Claude lit le vault, voit vos projets, charge l'overview pertinent, les conventions, les derniers session logs et le backlog. Il reprend la ou vous vous etiez arrete.
- **Fin de session** (`/session-end`): Claude ecrit ce qu'il a fait, les decisions prises, ce qui reste et les fichiers touches. La session suivante demarre avec le contexte complet.

Le vault est constitue de fichiers markdown organises par projet. Vous le gerez avec un CLI. Claude le navigue avec des slash commands. Il fonctionne aussi comme vault Obsidian, pour naviguer et chercher visuellement.

Pas de base de donnees. Pas de serveur. Pas de cles API. Juste des fichiers.

## Demarrage Rapide

```bash
# 1. Creer et lier un vault
npx mempunk

# 2. Ajouter un projet
npx mempunk project mon-app

# 3. Dans n'importe quelle session Claude Code, tapez:
/mempunk

# 4. Quand vous avez fini, tapez:
/session-end
```

## Reference du CLI

### Gestion du vault

```
mempunk setup                  Configuration interactive complete (recommande)
mempunk init [chemin] [options] Creer un nouveau vault
mempunk link <chemin>          Lier le vault a Claude Code (config globale)
mempunk unlink                 Dissocier le vault de Claude Code
mempunk status                 Dashboard du vault avec info des projets
mempunk sync                   Ajouter les fichiers manquants aux projets existants
mempunk doctor                 Verifier la sante et l'integrite du vault
mempunk -v                     Afficher la version
```

### Gestion des projets

```
mempunk project <nom>          Ajouter un nouveau projet au vault
mempunk remove <nom>           Supprimer un projet du vault
mempunk backlog <nom>          Voir le backlog d'un projet dans le terminal
mempunk log <nom>              Ouvrir le session log dans votre editeur
```

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
```

## Structure du Vault

```
vault/
├── CLAUDE.md              # Point d'entree — Claude lit ceci en premier
├── projects/
│   └── mon-projet/
│       ├── overview.md    # Ce qu'est le projet, stack, repo, etat
│       ├── architecture.md # Decisions techniques et diagrammes
│       ├── conventions.md # Regles du projet, standards de code, patterns
│       ├── backlog.md     # Taches priorisees (- [ ] / - [x])
│       ├── session-log.md # Ce que Claude a fait a chaque session
│       └── decisions/     # Architecture Decision Records
├── areas/                 # Responsabilites continues (pas des projets)
├── resources/             # Connaissances techniques reutilisables
└── daily/                 # Logs de session quotidiens
```

`mempunk project <nom>` cree cette structure et enregistre le projet dans `CLAUDE.md` avec un `[[wikilink]]` direct.

`mempunk sync` ajoute les fichiers de template manquants (comme `conventions.md`) aux projets existants sans ecraser.

## Flux de Session

### Debut: `/mempunk`

Installe globalement dans `~/.claude/skills/mempunk/` lors du setup. Quand vous tapez `/mempunk` dans une session Claude Code, Claude:

1. Lit le `CLAUDE.md` du vault
2. Voit l'index des projets avec des liens directs
3. Demande sur quel projet vous voulez travailler
4. Lit l'overview et les conventions du projet
5. Lit les 3 derniers session logs et le backlog
6. Confirme le contexte avant de continuer

### Fin: `/session-end`

Installe globalement dans `~/.claude/skills/session-end/`. Quand vous tapez `/session-end`, Claude:

1. Identifie sur quel projet on a travaille
2. Ecrit une entree structuree dans le `session-log.md` du projet
3. Inclut: ce qui a ete fait, decisions, etat actuel, prochaines etapes, fichiers modifies
4. Note les conventions qui ont ete etablies ou modifiees
5. Confirme ce qui a ete enregistre

La session suivante reprend exactement la ou celle-ci s'est arretee.

## Maintenance du Vault

```bash
# Ajouter les fichiers manquants aux projets existants apres une mise a jour de mempunk
mempunk sync

# Verifier l'integrite — projets fantomes, fichiers manquants, enregistrements casses
mempunk doctor
```

## Compatible Obsidian

Tous les fichiers utilisent des `[[wikilinks]]`. Ouvrez le vault dans Obsidian et la vue graphe montre les connexions entre `CLAUDE.md`, overviews, backlogs, docs d'architecture, conventions et session logs.

## Langues

Disponibles: **English** (defaut), **Espanol**, **Portugues**, **Francais**

Utilisez `--lang es`, `--lang pt` ou `--lang fr` avec n'importe quelle commande, ou selectionnez interactivement lors du setup.

## Licence

[MIT](LICENSE)
