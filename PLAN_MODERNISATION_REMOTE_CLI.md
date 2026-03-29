# Plan De Modernisation - Vrai Mode Telecommande CLI

Date de reference : 2026-03-29
Produit concerne : VibeRemote

## 1. Objet

Ce document transforme le cahier des charges existant en plan de modernisation concret pour faire de VibeRemote une vraie telecommande des CLI de code.

Le plan s'appuie sur :

- le cahier des charges local
- l'alignement actuel du code
- le backlog MVP
- les patterns produits documentes publiquement autour de Claude Code Remote Control, Channels, Memory, Hooks, MCP, Subagents et Agent Teams

Important :

- le terme "cowork" n'apparait pas comme une fonctionnalite autonome dans les pages officielles consultees
- l'inspiration la plus proche est une combinaison de Remote Control, Dispatch, Desktop, Channels, Subagents et Agent Teams
- les choix ci-dessous sont donc en partie une inference produit a partir de ces sources

## 2. Lecture De La Cible

### 2.1 Cible locale deja exprimee dans le repo

La cible voulue par VibeRemote est deja tres claire :

- dossier d'abord, commande ensuite
- plusieurs CLI locaux, avec mode Auto et fallback robuste
- Telegram et GUI synchronises
- memoire locale persistante en Markdown
- recherche hybride QMD + BM25 + couche vectorielle locale
- experience simple, rassurante, basee sur des tuiles

Cette cible apparait notamment dans :

- [CAHIER_DES_CHARGES.md](./CAHIER_DES_CHARGES.md)
- [ALIGNEMENT_CDC.md](./ALIGNEMENT_CDC.md)
- [BACKLOG_MVP.md](./BACKLOG_MVP.md)

### 2.2 Patterns Claude Code a reprendre

Les patterns produits les plus pertinents a reprendre sont :

1. Session locale pilotable a distance
- Remote Control garde l'execution sur la machine locale tout en synchronisant plusieurs surfaces.

2. Distinction entre "piloter une session existante" et "pousser un evenement externe"
- Remote Control sert a conduire une session vivante.
- Channels sert a injecter des messages externes comme Telegram dans une session deja ouverte.

3. Memoire projet explicite et lisible
- CLAUDE.md sert de memoire/instructions persistantes de projet.
- une memoire automatique compacte sert d'index durable et lisible entre sessions.

4. Couche de hooks avant et apres action
- hooks de type SessionStart, UserPromptSubmit et PreToolUse permettent d'injecter du contexte, de router, de bloquer ou de transformer.

5. Outils et integrations via un contrat stable
- MCP formalise l'ajout d'outils externes avec une logique de portee projet/equipe.

6. Delegation structuree
- Subagents et Agent Teams montrent comment separer recherche, planification, execution et verification dans des contextes distincts.

7. Isolation des sessions paralleles
- Remote Control et Desktop documentent la notion de sessions paralleles et d'isolation via worktree pour eviter les conflits.

## 3. Diagnostic VibeRemote Au 2026-03-29

### 3.1 Points deja bien engages

- Le dispatch texte existe deja et route une partie des intentions locales avant le pipeline.
- Le navigateur de dossiers par tuiles existe deja.
- Le CLI s'execute dans le dossier actif choisi.
- Le fallback multi-CLI a deja une meilleure classification des erreurs.
- La memoire locale `.md` + QMD + BM25 existe deja.
- Telegram et le GUI partagent deja une partie des memes actions.

### 3.2 Ecarts majeurs restants

1. Le produit reste encore hybride entre "bot de code" et "telecommande"
- Il faut assumer completement un mode "remote CLI" centre sur l'etat de session, pas sur le chat brut.

2. Le contrat d'adaptation des CLI n'est pas encore assez explicite
- Chaque CLI devrait exposer les memes operations et les memes raisons d'echec.

3. Le fallback reste surtout reactif
- Il faut une vraie politique de fallback observable, testable et configurable.

4. La memoire manque d'une couche "memoire projet lisible"
- Les journaux existent, mais il manque une entree de memoire concise equivalente a un `CLAUDE.md` ou `MEMORY.md` de projet.

5. La couche vectorielle/embedding local configurable n'est pas explicite
- QMD couvre deja une partie du besoin, mais l'application ne decrit pas encore un backend interchangeable et observable.

6. Il n'existe pas de vraie suite de tests produit
- le script `npm test` echoue par defaut
- il manque des tests unitaires, d'integration, de scenario et de non-regression UI

7. La notion de sessions paralleles isolees n'est pas formalisee
- pour se rapprocher d'un mode "cowork", il faut pouvoir lancer des sessions concurrentes propres, idealement isolees

## 4. Vision Produit Cible

VibeRemote doit devenir un orchestrateur de sessions CLI locales avec quatre modes lisibles :

1. Navigation
- choisir un dossier
- consulter sa memoire
- ouvrir l'IDE

2. Pilotage
- envoyer une demande libre
- choisir ou laisser `Auto` pour CLI, modele et niveau d'autonomie

3. Suivi
- voir le statut, les tentatives, le CLI effectif, le fallback, les fichiers touches et les verifications

4. Relance
- reprendre une session
- renvoyer sur un autre CLI
- ouvrir une session parallele

Le principe directeur doit etre :

"Un utilisateur peut, depuis Telegram ou le GUI, selectionner un dossier, lancer une tache sur un CLI local, suivre l'execution, reprendre la session plus tard et laisser le systeme basculer intelligemment si un fournisseur atteint une limite."

## 5. Architecture Cible

## 5.1 Couche 1 - Session Router

Responsabilite :

- recevoir toute entree Telegram/GUI
- distinguer action locale, action de session, action de configuration et tache de code
- maintenir un etat de session uniforme

Etat minimal par session :

- `workspacePath`
- `sessionId`
- `sessionMode`
- `dispatchMode`
- `preferredCli`
- `preferredModel`
- `preferredIde`
- `permissionMode`
- `activeRun`
- `lastTrace`
- `fallbackCount`

Recommendation :

- formaliser une machine d'etat simple :
  - `idle`
  - `browsing_workspace`
  - `awaiting_prompt`
  - `running_cli`
  - `waiting_permission`
  - `fallback_retry`
  - `review_ready`
  - `failed`

## 5.2 Couche 2 - Workspace Manager

Responsabilite :

- navigation dossier par tuiles
- choix du dossier courant
- verification de securite des chemins
- creation de nouveaux dossiers/projets
- option future d'isolation de session via git worktree

Recommendation :

- remplacer la notion UI de "projet" par "workspace" partout dans le flux principal
- garder "projet" comme etiquette secondaire si besoin

## 5.3 Couche 3 - CLI Adapters

Responsabilite :

- encapsuler chaque CLI dans le meme contrat

Contrat recommande :

- `detect()`
- `listModels()`
- `execute({ cwd, prompt, model, env, timeoutMs })`
- `classifyFailure(result)`
- `supportsResume()`
- `supportsRemote()`
- `supportsStreaming()`

But :

- sortir la logique specifique des CLI du pipeline central
- rendre le fallback et les tests deterministes

## 5.4 Couche 4 - Fallback Policy Engine

Responsabilite :

- choisir le prochain CLI selon la raison d'echec
- tracer pourquoi on rebascule
- decider quand retenter, quand escalader, quand arreter

Raisons a normaliser :

- `cli_unavailable`
- `spawn_error`
- `timeout`
- `empty_output`
- `invalid_format`
- `rate_limit`
- `quota_limit`
- `token_limit`
- `auth_error`
- `network_error`
- `verification_failed`

Recommendation :

- stocker une trace structuree par tentative
- afficher cette trace dans Telegram et dans le GUI
- permettre une politique configurable par session ou globale

## 5.5 Couche 5 - Memory Service

Responsabilite :

- gerer la memoire projet
- exposer un contexte court pour l'execution
- journaliser les sessions et les traces de fallback

Structure cible :

- `MEMORY/weekly/YYYY-Www.md`
- `MEMORY/sessions/*.md`
- `MEMORY/project/MEMORY.md`
- `MEMORY/project/topics/*.md`
- `MEMORY/index/` pour les artefacts techniques d'indexation si necessaire

Recommendation :

- ajouter un `MEMORY/project/MEMORY.md` compact charge en priorite
- utiliser les journaux hebdo et sessions comme matiere premiere
- conserver QMD comme moteur nominal
- ajouter une abstraction de backend vectoriel local configurable

## 5.6 Couche 6 - Remote Surfaces

Responsabilite :

- Telegram
- GUI Electron
- futur bridge "channel" si tu veux pousser des evenements externes dans une session vivante

Recommendation :

- Telegram et GUI ne doivent pas etre deux produits differents
- ils doivent consommer le meme schema d'etat et les memes actions

## 6. Plan De Modernisation

## 6.1 Phase 1 - Stabiliser le vrai mode telecommande

Objectif :

- faire de VibeRemote un produit "workspace -> action -> session"

Travaux :

1. Formaliser le schema d'etat de session
2. Uniformiser les tuiles Telegram/GUI autour du meme catalogue d'actions
3. Rendre l'etat de session visible partout :
- workspace
- CLI actif
- modele
- statut
- tentative courante
- dernier fallback
4. Introduire un mode explicite `Remote CLI`
5. Ajouter la reprise de session et la relance manuelle

Critere de fin :

- l'utilisateur peut piloter une session sans passer par des menus techniques caches

## 6.2 Phase 2 - Refactorer l'orchestration CLI

Objectif :

- sortir du pipeline monolithique pour aller vers des adapters et une politique de fallback

Travaux :

1. Creer un adapter par CLI
2. Centraliser la classification des erreurs
3. Separer :
- selection du CLI
- execution
- parsing de resultat
- verification
- fallback
4. Ajouter une trace JSON/Markdown exploitable
5. Ajouter des timeouts et seuils par CLI

Critere de fin :

- chaque CLI peut etre teste seul
- le fallback est lisible et reproductible

## 6.3 Phase 3 - Faire une vraie memoire projet

Objectif :

- passer d'une collection de logs a une memoire de travail utile

Travaux :

1. Ajouter `MEMORY/project/MEMORY.md` comme index compact
2. Generer des topics de memoire utiles :
- build
- tests
- architecture
- bugs connus
- conventions
3. Formaliser le pipeline RAG :
- QMD prioritaire
- BM25 fallback lexical
- backend vectoriel local optionnel mais explicite
- modele d'embedding local configurable
4. Ajouter un resume automatique post-session
5. Ajouter une vue "Memoire" dans l'UI avec sections lisibles

Critere de fin :

- avant chaque run, le systeme sait recuperer un contexte court, stable et utile

## 6.4 Phase 4 - Parite Telegram / GUI

Objectif :

- faire du GUI un vrai miroir operable et pas un afficheur secondaire

Travaux :

1. Parite complete des actions
2. Historique visible des deux cotes
3. Trace de fallback visible
4. Etats de permission / attente / erreur mieux exposes
5. Finalisation i18n GUI
6. Checklist accessibilite clavier/contraste/focus/annonces et labels

Critere de fin :

- une demo complete peut se faire sans toucher Telegram

## 6.5 Phase 5 - Sessions paralleles et mode "cowork"

Objectif :

- se rapprocher du pattern Desktop/Remote/Agent Teams sans alourdir le MVP

Travaux :

1. Autoriser plusieurs sessions par workspace
2. Ajouter une option d'isolation :
- `same-dir`
- `worktree`
3. Permettre une session de recherche et une session d'execution
4. Introduire des profils de taches :
- `explore`
- `plan`
- `implement`
- `verify`
5. Eventuellement brancher une delegation multi-agent plus tard

Critere de fin :

- l'utilisateur peut lancer une tache parallele sans risquer d'ecraser son travail principal

## 6.6 Phase 6 - Vrai mode remote externe

Objectif :

- preparer VibeRemote a un pilotage distant plus robuste

Travaux :

1. Definir si Telegram agit comme :
- simple surface UI
- ou vrai canal d'injection d'evenements dans une session vivante
2. Ajouter la notion de session distante reprise
3. Ajouter la gestion des demandes de permission distantes
4. Ajouter un mode service/persistent process
5. Documenter les contraintes de securite

Critere de fin :

- le produit peut etre laisse actif et continue a recevoir des ordres sans ambiguite sur la session cible

## 7. Priorisation Recommandee

Ordre recommande :

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6

Raison :

- sans session state claire, la suite sera fragile
- sans adapters CLI, le fallback restera difficile a fiabiliser
- sans memoire projet compacte, le RAG restera surtout un journal
- les sessions paralleles ne valent le coup qu'une fois le coeur stable

## 8. Plan De Test

## 8.1 Objectif

Verifier que VibeRemote fonctionne comme une telecommande robuste de CLI, pas seulement comme un bot de code.

## 8.2 Niveau 1 - Tests unitaires

Modules a couvrir en priorite :

1. `utils/dispatch.js`
- detection d'intention
- priorite action locale vs pipeline code
- choix repo/CLI/IDE/langue

2. `utils/actions.js`
- securisation des chemins
- navigation dossier
- creation de workspace
- refus des sorties hors depot

3. `utils/agents.js`
- classification des raisons d'echec
- choix du fallback
- propagation du `cwd`
- trace structuree

4. `utils/memory.js`
- generation hebdo
- sauvegarde session
- lecture historique
- pipeline QMD -> BM25
- resilience en absence de QMD

5. `utils/i18n.js`
- couverture des cles
- fallback de langue

## 8.3 Niveau 2 - Tests d'integration

Scenarios prioritaires :

1. Choisir un dossier puis lancer un CLI dans ce dossier
2. Echec `rate_limit` puis bascule sur un second CLI
3. Echec `token_limit` puis bascule sur un second CLI
4. Sortie vide puis echec de format puis escalade
5. Sauvegarde automatique de session + weekly log + trace fallback
6. Lecture memoire avant run
7. Ouverture IDE avec fallback

Approche :

- mocker les CLI via executables de test
- simuler stdout/stderr/exitCode/timeout
- verifier les fichiers Markdown et l'etat final de session

## 8.4 Niveau 3 - Tests de parite surface

But :

- verifier que Telegram et GUI pilotent le meme produit

Cas a couvrir :

1. meme tuile, meme resultat
2. changement de langue synchronise
3. changement de workspace synchronise
4. historique visible des deux cotes
5. vue memoire visible des deux cotes
6. indicateur de dispatch coherent

## 8.5 Niveau 4 - Tests end-to-end produit

Scenarios MVP :

1. "Je choisis un dossier, je demande, ca code"
2. "J'ouvre l'IDE du dossier courant"
3. "Mon CLI prefere echoue, le fallback prend le relais"
4. "Je reprends une session apres interruption"
5. "Je consulte la memoire avant une nouvelle demande"
6. "Je pilote depuis Telegram sans toucher au PC"
7. "Je pilote depuis le GUI sans regarder Telegram"

## 8.6 Niveau 5 - Tests de fautes et resilience

Matrice minimale :

- CLI absent
- modele absent
- timeout
- sortie vide
- sortie invalide
- quota
- rate limit
- token limit
- auth error
- reseau coupe
- dossier supprime pendant la session
- IDE prefere introuvable
- QMD indisponible
- index corrompu

## 8.7 Niveau 6 - Tests accessibilite et UX

Verifier :

- navigation clavier
- ordre de tabulation
- focus visible
- contraste
- messages d'erreur lisibles
- actions principales visibles sans jargon
- comprehension de l'etat courant en moins de 5 secondes

## 8.8 Niveau 7 - Tests de performance

Mesures minimales :

- temps d'affichage du menu principal
- temps de navigation dossier
- temps de preparation de contexte memoire
- temps avant premier retour utilisateur
- temps total moyen avant fallback

## 8.9 Niveau 8 - Tests de securite

Verifier :

- path traversal refuse
- ecriture hors workspace refusee
- commandes shell dangereuses bloquees
- utilisateur Telegram non autorise bloque
- approbations distantes journalisees

## 9. Strategie D'implementation Des Tests

Recommendation pragmatique :

1. Installer une vraie base de test JS
- Vitest est le meilleur choix vu le repo et les dependances presentes

2. Ajouter des fixtures CLI
- petits scripts simulant `success`, `timeout`, `quota`, `token_limit`, `empty_output`

3. Ajouter un dossier `tests/fixtures/workspaces/`
- workspaces minimaux pour simuler React, Node, Python, monorepo

4. Ajouter des snapshots de traces
- fallback trace
- memory summary
- tile state

5. Ajouter un smoke script local
- lance une session test sans Telegram reel
- simule quelques actions GUI et dispatch texte

## 10. Definition Of Done Produit

VibeRemote pourra etre considere comme un vrai mode telecommande CLI quand :

1. L'utilisateur peut choisir un workspace et lancer une tache sans config technique obligatoire.
2. Le CLI s'execute toujours dans le bon dossier.
3. Le fallback multi-CLI est traque, testable et visible.
4. La memoire projet est lisible, compacte et utile avant execution.
5. Telegram et GUI sont en parite sur les actions critiques.
6. Les erreurs de permission, quota et timeout sont comprensibles.
7. Une suite de tests couvre les modules critiques et les scenarios MVP.

## 11. Premiere Iteration Recommandee

Si on doit lancer la modernisation maintenant, l'ordre de chantier le plus rentable est :

1. Mettre Vitest et ecrire les tests sur `dispatch`, `actions`, `agents`, `memory`
2. Formaliser le schema d'etat de session
3. Introduire les adapters CLI
4. Ajouter `MEMORY/project/MEMORY.md`
5. Finaliser la parite Telegram/GUI sur statut, fallback et memoire
6. Ajouter ensuite les sessions paralleles isolees

## 12. Sources

Sources locales :

- [CAHIER_DES_CHARGES.md](./CAHIER_DES_CHARGES.md)
- [ALIGNEMENT_CDC.md](./ALIGNEMENT_CDC.md)
- [BACKLOG_MVP.md](./BACKLOG_MVP.md)

Sources externes officielles :

- Claude Code Remote Control
- Claude Code Channels
- Claude Code Memory
- Claude Code Hooks
- Claude Code MCP
- Claude Code Subagents
- Claude Code Agent Teams
- Claude Code Desktop
