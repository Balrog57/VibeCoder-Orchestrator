# Backlog MVP - VibeRemote

Ce document traduit le [cahier des charges](./CAHIER_DES_CHARGES.md) en plan d'execution concret.
Il contient :

- un backlog priorise
- les user stories MVP
- un gap analysis entre la cible et l'etat actuel du code

## 1. Priorisation MVP

### P0 - Indispensable (bloquant MVP)

1. Parcours ultra-simple "je choisis un dossier, je demande, ca code"
Statut actuel : partiel
Critere de fin : aucun menu technique obligatoire pour lancer une demande de code sur un projet actif.

2. Fallback multi-CLI robuste en cas d'erreur, timeout, quota, token limit
Statut actuel : partiel
Critere de fin : fallback declenche sur erreurs explicites avec telemetrie de la raison et du CLI suivant.

3. Synchronisation Telegram <-> GUI sur etat et actions
Statut actuel : majoritairement present
Critere de fin : toute action disponible dans Telegram est equivalente dans le miroir PC.

4. Memoire persistante hebdomadaire `.md`
Statut actuel : manquant
Critere de fin : ecriture dans `MEMORY/weekly/YYYY-Www.md` active en plus des sessions detaillees.

5. Recherche hybride QMD + BM25 + base vectorielle locale + embedding local
Statut actuel : partiel
Critere de fin : pipeline de recherche clairement compose, fallback officiel, et source embedding locale documentee/configurable.

6. Securite d'execution minimale (path traversal, commande RUN)
Statut actuel : present
Critere de fin : garde-fous actifs et verifies par tests unitaires.

7. Architecture multi-langue native avec priorite `fr` et `en`
Statut actuel : manquant
Critere de fin : toutes les chaines UI Telegram + GUI sont externalisees avec bascule de langue par session.

### P1 - Important (stabilisation MVP)

1. Observabilite du pipeline (CLI choisi, cause fallback, tentatives, durees)
Statut actuel : partiel
Critere de fin : traces lisibles en UI + journaux persistants.

2. UX kawaii accessible (lisibilite, contraste, tuiles explicites, feedback)
Statut actuel : partiel
Critere de fin : checklist accessibilite basique validee (focus clavier, contraste, etats visuels clairs).

3. Tests automatises de non-regression sur modules critiques
Statut actuel : manquant
Critere de fin : tests sur `actions`, `memory`, `cli-detector`, handlers principaux.

4. Cohabitation des commandes shell selon plateforme
Statut actuel : partiel
Critere de fin : conventions shell unifiees et documentees (Windows prioritaire).

### P2 - Confort / Evolution proche

1. Fallback IDE enrichi (open fichier precis, open selection)
2. Resume hebdomadaire automatique
3. Suggestions de CLI selon type de tache
4. Parametrage avance des politiques de retry/fallback

## 2. User Stories MVP

### Epic A - Telecommande simple

US-A1
En tant qu'utilisateur, je veux selectionner rapidement un projet pour lancer mes demandes de code.
Acceptance criteria :
- Depuis Telegram, je peux choisir un dossier existant.
- Depuis le GUI, je vois le projet actif en miroir.
- Si aucun projet n'est actif, le systeme me guide sans erreur brute.

US-A2
En tant qu'utilisateur, je veux envoyer une demande libre et obtenir un resultat sans config technique.
Acceptance criteria :
- Une demande texte declenche le pipeline automatiquement.
- Le statut de progression est visible sur Telegram et GUI.
- Le resultat final indique succes/echec et fichiers modifies.

### Epic B - Multi-CLI avec fallback

US-B1
En tant qu'utilisateur, je veux laisser le systeme choisir automatiquement un CLI.
Acceptance criteria :
- Le mode `Auto` est possible sans choix manuel.
- Le systeme essaye seulement des CLI detectes et non desactives.

US-B2
En tant qu'utilisateur, je veux que le systeme bascule automatiquement en cas d'echec CLI.
Acceptance criteria :
- En cas d'echec, timeout ou sortie vide, un autre CLI est tente.
- L'interface me montre le nombre de tentatives.
- Le resume de session stocke le CLI final utilise.

US-B3
En tant qu'utilisateur avance, je veux forcer ou exclure des CLI via tuiles.
Acceptance criteria :
- Je peux activer/desactiver chaque CLI.
- Je peux fixer un CLI prefere ou revenir a `Auto`.
- Les changements sont pris en compte au run suivant.

### Epic C - Multi-IDE

US-C1
En tant qu'utilisateur, je veux ouvrir mon projet actif dans un IDE depuis Telegram/GUI.
Acceptance criteria :
- Le bouton "Ouvrir IDE" fonctionne si un projet est actif.
- Si l'IDE prefere echoue, fallback sur un IDE autorise.
- Un message clair indique l'IDE lance.

US-C2
En tant qu'utilisateur, je veux configurer mes IDE via tuiles.
Acceptance criteria :
- Je peux activer/desactiver chaque IDE.
- Je peux choisir un IDE prefere ou `Auto`.
- La config est visible dans settings.

### Epic D - Memoire persistante

US-D1
En tant qu'utilisateur, je veux une memoire hebdomadaire en Markdown pour suivre l'historique du projet.
Acceptance criteria :
- Un fichier hebdomadaire `MEMORY/weekly/YYYY-Www.md` est cree automatiquement.
- Chaque session y ajoute un resume standardise.
- Le format reste lisible a la main.

US-D2
En tant qu'utilisateur, je veux retrouver du contexte via recherche hybride locale.
Acceptance criteria :
- QMD est tente en premier.
- BM25 local prend le relais si QMD indisponible.
- Le contexte retourne est injecte au prompt agent.

US-D3
En tant qu'utilisateur, je veux que la recherche exploite aussi des embeddings locaux.
Acceptance criteria :
- Le backend d'embedding local est configurable.
- L'index vectoriel est local.
- Le systeme reste fonctionnel hors cloud.

### Epic E - Fiabilite et securite

US-E1
En tant qu'utilisateur, je veux eviter les ecritures hors depot et les commandes dangereuses.
Acceptance criteria :
- Les chemins de fichiers sont contraints au repo cible.
- `### RUN` refuse les operateurs shell dangereux.

US-E2
En tant qu'utilisateur, je veux un produit stable a chaque evolution.
Acceptance criteria :
- Une suite de tests minimale est executee en CI locale.
- Les regressions critiques sont detectees avant release.

### Epic F - Multi-langue

US-F1
En tant qu'utilisateur, je veux utiliser l'application en francais ou en anglais.
Acceptance criteria :
- Le systeme propose au minimum `fr` et `en`.
- La langue active est appliquee a Telegram et au GUI.
- Le choix est memorise par session.

US-F2
En tant qu'equipe produit, je veux une architecture i18n maintenable.
Acceptance criteria :
- Les textes ne sont pas hardcodes dans les handlers.
- Les dictionnaires sont centralises par cle.
- Un fallback de langue est defini (`en` puis `fr`).

## 3. Gap Analysis (etat actuel vs cible)

### 3.1 Ce qui est deja en place

1. Telecommande Telegram + miroir GUI fonctionnels
Preuve : [index.js](./index.js), [gui/renderer.js](./gui/renderer.js), [utils/ui.js](./utils/ui.js)

2. Configuration par tuiles pour CLI/Model/IDE + actions principales
Preuve : [utils/ui.js](./utils/ui.js), handlers dans [index.js](./index.js)

3. Fallback multi-CLI operationnel (ordre dynamique, CLI desactives, CLI prefere)
Preuve : [utils/agents.js](./utils/agents.js), [utils/cli-detector.js](./utils/cli-detector.js)

4. Fallback IDE operationnel
Preuve : [utils/ide-manager.js](./utils/ide-manager.js), `action:open_ide` dans [index.js](./index.js)

5. Garde-fous importants cotes application de code et `### RUN`
Preuve : [utils/actions.js](./utils/actions.js)

### 3.2 Ecarts P0 a combler

1. Memoire hebdomadaire non implementee
Constat :
- Le code journalise actuellement au format quotidien `MEMORY/YYYY-MM-DD.md`.
- Le cahier des charges demande explicitement `MEMORY/weekly/YYYY-Www.md`.
Zone concernee : [utils/memory.js](./utils/memory.js)

2. Couche vectorielle locale explicite absente
Constat :
- QMD est utilise et BM25 fallback existe.
- Mais aucune couche explicite de base vectorielle locale configurable n'apparait dans le code.
Zone concernee : [utils/memory.js](./utils/memory.js)

3. Modele d'embedding local non explicite/non parametrable
Constat :
- Le cahier des charges exige un modele d'embedding local remplaçable.
- Le code actuel n'expose pas de configuration claire de ce composant.
Zone concernee : [utils/memory.js](./utils/memory.js), `setup`

4. Tracabilite fine des raisons de fallback insuffisante
Constat :
- Les logs console existent, mais pas de schema persistant normalise (raison fallback, code erreur, duree par tentative).
Zone concernee : [utils/agents.js](./utils/agents.js), [index.js](./index.js), [utils/memory.js](./utils/memory.js)

5. Parcours "juste se positionner dans un dossier" encore manuel
Constat :
- La selection de projet existe, mais la detection automatique du dossier courant de l'utilisateur n'est pas formalisee.
Zone concernee : [index.js](./index.js), UX de selection projet

6. Multi-langue non structure
Constat :
- Les textes sont majoritairement hardcodes en francais dans le code.
- Aucun systeme de dictionnaires/locale n'est present pour Telegram et GUI.
Zone concernee : [index.js](./index.js), [utils/ui.js](./utils/ui.js), [gui/renderer.js](./gui/renderer.js)

### 3.3 Ecarts P1 importants

1. Tests automatises absents
Constat :
- Pas de suite de tests reelle.
Zone concernee : global

2. UX/accessibilite non mesuree
Constat :
- Interface kawaii presente, mais sans checklist accessibilite formalisee.
Zone concernee : [gui/index.html](./gui/index.html), [gui/style.css](./gui/style.css)

3. Telemetrie operationnelle legere
Constat :
- Peu d'indicateurs persistants exploitables pour debug/observabilite.
Zone concernee : logging global

## 4. Plan de livraison recommande (3 sprints)

### Sprint 1 - Conformite socle (P0)

- Implementer journal hebdomadaire `MEMORY/weekly/YYYY-Www.md`.
- Ajouter un schema d'evenement standard (tentative, CLI, erreur, fallback, duree).
- Normaliser l'ecriture memoire dans le pipeline principal.
- Mettre en place la couche i18n (dictionnaires `fr`/`en`, locale de session, fallback de langue).
- Ajouter tests unitaires sur `utils/actions.js` et `utils/agents.js`.

Definition of Done :
- Critere MVP #6 valide (hebdo).
- Critere MVP #3 robuste (fallback trace).
- Critere MVP #11 valide (multi-langue FR/EN).

### Sprint 2 - Recherche locale complete (P0/P1)

- Introduire une couche explicite d'index vectoriel local.
- Brancher un modele d'embedding local configurable (fichier de config/env).
- Garder QMD nominal + BM25 fallback.
- Ajouter tests d'integration de recherche.

Definition of Done :
- Criteres MVP #7 et #8 valides.

### Sprint 3 - Accessibilite et stabilisation (P1)

- Revue UX kawaii avec checklist accessibilite simple.
- Amelioration feedback utilisateur sur erreurs/fallback.
- Durcir la non-regression (tests smoke Telegram/GUI).

Definition of Done :
- Critere MVP #10 valide.
- Experience de base stable pour usage quotidien.

## 5. Decisions techniques a trancher rapidement

1. Backend vectoriel local
Options candidates : SQLite+vec, Chroma local, LanceDB local.
Decision attendue : un backend unique pour MVP.

2. Modele d'embedding local
Options candidates : `all-MiniLM-L6-v2` via runtime local, bge-small, qwen-embed local.
Decision attendue : modele par defaut + mecanisme de remplacement.

3. Politique exacte de fallback CLI
Decision attendue :
- nombre max de tentatives
- classes d'erreurs retryables
- conditions d'arret

4. Contrat de tracing session
Decision attendue : schema unique ecrit en Markdown + metadata structurable (frontmatter/YAML ou JSON sidecar).
