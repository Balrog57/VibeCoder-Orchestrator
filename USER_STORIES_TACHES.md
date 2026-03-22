# User Stories Et Taches Techniques - VibeRemote

Ce document decoupe le projet en lots executables.
Il complete le backlog MVP avec un niveau directement actionnable pour le dev.

## Epic 1 - Telecommande Unifiee Telegram + PC

### US-1.1 Selection de projet
En tant qu'utilisateur, je veux choisir un projet rapidement pour lancer mes demandes.

Critere d'acceptation :
- Selection projet possible via tuiles Telegram et GUI.
- Projet actif synchronise entre Telegram et GUI.

Taches techniques :
- Maintenir `session.activeRepo` comme source de verite.
- Unifier les events `session-update` entre Telegram et Electron.
- Ajouter tests smoke sur `select_repo`, `new_repo`, pagination.

### US-1.2 Demande naturelle
En tant qu'utilisateur, je veux ecrire une demande libre et recevoir un resultat de code.

Critere d'acceptation :
- Pipeline execute sans configuration manuelle obligatoire.
- Feedback progression visible sur les deux interfaces.

Taches techniques :
- Consolider `processPipelineRequest`.
- Uniformiser les messages d'etat via i18n.
- Ajouter gestion d'erreur utilisateur lisible.

## Epic 2 - Orchestration Multi-CLI Avec Fallback

### US-2.1 Mode auto
En tant qu'utilisateur, je veux que le systeme choisisse le meilleur CLI disponible.

Critere d'acceptation :
- Detection dynamique des CLI installes.
- Respect des CLI desactives.

Taches techniques :
- Durcir `scanAvailableClis`.
- Stocker la liste CLI disponible par session.
- Ajouter tests detection indisponibilite CLI.

### US-2.2 Fallback robuste
En tant qu'utilisateur, je veux un fallback automatique en cas d'echec CLI.

Critere d'acceptation :
- Retry/fallback sur erreur, timeout, sortie vide.
- Trace persistante des tentatives et de la raison de fallback.

Taches techniques :
- Enrichir `utils/agents.js` avec codes de raison normalises.
- Ajouter schema de trace de tentative dans la memoire.
- Exposer en UI le CLI final et le nombre de tentatives.

## Epic 3 - Multi-IDE

### US-3.1 Ouverture IDE
En tant qu'utilisateur, je veux ouvrir mon projet actif dans un IDE depuis Telegram ou PC.

Critere d'acceptation :
- Action tuiles fonctionnelle.
- Fallback IDE effectif si IDE prefere echoue.

Taches techniques :
- Maintenir `utils/ide-manager.js` et ordre fallback.
- Ajouter verification de lancement reussi (feedback).
- Ajouter action future "ouvrir fichier cible".

## Epic 4 - Memoire Persistante Et Recherche

### US-4.1 Journal hebdomadaire
En tant qu'utilisateur, je veux un journal hebdomadaire `.md` de mes sessions.

Critere d'acceptation :
- Ecriture dans `MEMORY/weekly/YYYY-Www.md`.
- Resume standardise par session.

Taches techniques :
- Ajouter helper `getWeeklyFilePath`.
- Brancher l'ecriture hebdo dans `appendToDailyLog` ou equivalent.
- Ajouter tests sur generation de semaine ISO.

### US-4.2 Recherche hybride locale
En tant qu'utilisateur, je veux retrouver du contexte via QMD + BM25 + vecteurs locaux.

Critere d'acceptation :
- QMD nominal.
- BM25 fallback.
- Couche vectorielle locale et embedding local configurables.

Taches techniques :
- Ajouter module vector store local (choix MVP).
- Ajouter provider embedding local (choix MVP).
- Ajouter parametres `.env` pour model et backend.

## Epic 5 - Multi-Langue (FR/EN Prioritaires)

### US-5.1 Changement de langue
En tant qu'utilisateur, je veux utiliser VibeRemote en francais ou en anglais.

Critere d'acceptation :
- Commande `/lang` disponible.
- Tuile langue en settings.
- Bascule appliquee a Telegram + GUI miroir.

Taches techniques :
- Maintenir dictionnaires dans `utils/i18n.js`.
- Externaliser tous les textes UI dans des cles i18n.
- Synchroniser `session.locale` via IPC.

### US-5.2 Architecture i18n maintenable
En tant qu'equipe, je veux ajouter une langue sans refonte.

Critere d'acceptation :
- Pas de hardcode UI critique hors dictionnaires.
- Fallback de langue documente (`en` puis `fr`).

Taches techniques :
- Ajouter audit `rg` des hardcodes utilisateurs.
- Ajouter tests unitaires `t(locale,key)` fallback.
- Ajouter guide i18n dans README.

## Epic 6 - Qualite Et Securite

### US-6.1 Garde-fous execution
En tant qu'utilisateur, je veux un systeme qui evite les operations dangereuses.

Critere d'acceptation :
- Validation path traversal active.
- `### RUN` sans shell et operateurs dangereux bloques.

Taches techniques :
- Conserver `resolvePathInsideRepo`.
- Etendre les tests sur parse commande.

### US-6.2 Non-regression
En tant qu'equipe, je veux detecter les regressions tot.

Critere d'acceptation :
- Tests unitaires minimum sur modules critiques.
- Script `npm test` reel (pas placeholder).

Taches techniques :
- Ajouter framework de test (Node test natif ou Vitest).
- Couvrir `actions`, `agents`, `memory`, `i18n`.
- Ajouter test de fumee sur handlers essentiels.

