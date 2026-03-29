# Cahier des charges - VibeRemote

## 1. Vision produit

VibeRemote est une application de telecommande de developpement assiste par IA.
Elle permet de piloter differents CLI de code locaux depuis Telegram, tout en affichant un miroir temps reel sur le PC via une interface Electron kawaii, simple et accessible.

Le produit doit donner l'impression suivante :

- l'utilisateur se place dans un dossier de projet
- il formule sa demande en langage naturel
- le systeme choisit automatiquement le meilleur CLI disponible
- si le CLI echoue, atteint une limite de token, timeout, quota ou format invalide, un fallback automatique prend le relais
- le resultat est visible a la fois dans Telegram et sur le PC
- la memoire du projet s'enrichit automatiquement semaine apres semaine

## 2. Objectifs

- Offrir une experience de telecommande de code simple depuis Telegram.
- Proposer un miroir local sur PC pour suivre l'etat, les actions et les resultats.
- Supporter plusieurs CLI de code avec selection automatique, configuration manuelle et fallback intelligent.
- Supporter plusieurs IDE avec ouverture rapide du projet courant.
- Prevoir le multi-langue des le depart avec priorite francaise et anglaise.
- Reduire au maximum la friction utilisateur : choisir un dossier, ecrire une demande, laisser l'orchestrateur agir.
- Conserver une memoire persistante locale en Markdown, exploitable via recherche hybride QMD + BM25 + base vectorielle + modele d'embedding local.
- Rendre l'outil accueillant, kawaii et accessible meme pour un utilisateur non expert.

## 3. Public cible

- Developpeurs solo qui veulent piloter leur environnement depuis Telegram.
- Makers et utilisateurs avances qui jonglent entre plusieurs CLI IA.
- Utilisateurs qui veulent une interface locale plus rassurante qu'un bot seul.
- Utilisateurs Windows en priorite, avec architecture extensible a d'autres OS.

## 4. Perimetre fonctionnel

### 4.1 Interfaces

Le produit doit exposer deux interfaces synchronisees :

- Une interface Telegram basee sur des commandes et des tuiles.
- Une interface locale Electron affichant les memes etats, raccourcis, menus et retours.

Les deux interfaces doivent rester coherentes :

- projet actif identique
- CLI actif identique
- modele actif identique
- IDE actif identique
- etat de traitement identique
- historique et messages visibles des deux cotes

### 4.2 Experience utilisateur cible

Le parcours nominal doit etre le plus simple possible :

1. L'utilisateur choisit ou confirme un dossier de projet local.
2. Il envoie une demande libre du type "ajoute une page login", "corrige les tests", "ouvre le projet dans Cursor".
3. Le systeme choisit un CLI compatible selon la configuration et les disponibilites.
4. Le systeme interroge la memoire locale du projet avant execution.
5. Le systeme lance le traitement, applique les fichiers, execute les verifications autorisees, puis renvoie le resultat.
6. Si le CLI echoue ou atteint une limite, le systeme bascule automatiquement vers un autre CLI.
7. La session est journalisee dans la memoire persistante.

Le parcours ne doit pas obliger l'utilisateur a :

- connaitre les differences entre les CLI
- gerer les options techniques avancees
- naviguer dans des menus complexes
- lire des logs verbeux pour comprendre l'etat

## 5. Exigences fonctionnelles

### 5.1 Gestion des projets

- Le systeme doit permettre de selectionner un dossier projet local.
- Le systeme doit permettre de creer un nouveau dossier projet.
- Le systeme doit memoriser le projet actif par session utilisateur.
- Le systeme doit afficher clairement le projet actif dans Telegram et dans le miroir PC.

### 5.2 Orchestration multi-CLI

Le systeme doit supporter au minimum :

- Codex CLI
- Claude Code
- Gemini CLI
- Qwen Code
- OpenCode

Le systeme doit :

- detecter automatiquement les CLI installes localement
- recuperer si possible les modeles disponibles par CLI
- permettre un mode `Auto`
- permettre de choisir un CLI prefere
- permettre de desactiver un ou plusieurs CLI via des tuiles ON/OFF
- permettre de choisir un modele prefere ou `Auto`
- gerer un ordre de fallback configurable

Le fallback doit se declencher au minimum dans les cas suivants :

- commande CLI indisponible
- erreur de lancement
- timeout
- sortie vide
- format de sortie invalide
- quota atteint
- limite de token atteinte
- erreur reseau ou authentification recouvrable

Le systeme doit conserver la trace du CLI effectivement utilise et du nombre de tentatives.

### 5.3 Telecommande Telegram

L'interface Telegram doit offrir :

- un ecran d'accueil
- un selecteur de projet
- une zone de commandes libres
- des tuiles de configuration
- un acces a l'historique
- un acces a la sauvegarde manuelle
- un acces a la configuration des IDE
- un acces aux aides et etats de session

Les actions frequentes doivent etre accessibles par tuiles :

- choisir un projet
- coder
- ouvrir un IDE
- choisir un CLI
- choisir un modele
- choisir un IDE
- activer ou desactiver un CLI
- activer ou desactiver un IDE
- consulter l'historique
- ajouter des notes
- revenir au menu principal

### 5.4 Miroir PC

L'interface PC doit :

- reprendre les memes actions que Telegram
- afficher l'etat en cours
- afficher les messages utilisateur et systeme
- afficher le projet actif
- afficher les tuiles d'action
- permettre l'envoi d'une demande libre
- afficher les succes, erreurs et etapes du pipeline

Le miroir PC ne doit pas etre une interface secondaire pauvre.
Il doit etre pleinement exploitable meme sans regarder Telegram.

### 5.5 Interface kawaii et accessible

L'interface locale doit etre :

- kawaii, chaleureuse et rassurante
- tres lisible
- simple a comprendre des la premiere ouverture
- adaptee a une navigation souris et clavier
- visuellement coherente entre etat idle, etat en cours, succes et erreur

Exigences UX :

- grosses tuiles claires et explicites
- labels en langage naturel
- feedback immediat apres chaque action
- peu de jargon technique visible par defaut
- contraste suffisant
- etats visuels bien distingues
- ton accueillant et motivant

### 5.6 Gestion des IDE

Le produit doit detecter automatiquement les IDE installes localement.

Le produit doit supporter au minimum, selon disponibilite :

- Cursor
- VS Code
- Windsurf
- WebStorm
- IntelliJ IDEA
- PyCharm
- Visual Studio

Le systeme doit :

- permettre un mode `Auto`
- permettre de choisir un IDE prefere
- permettre de desactiver un ou plusieurs IDE
- permettre l'ouverture rapide du projet actif
- tenter un fallback sur un autre IDE si l'IDE prefere ne peut pas etre lance

### 5.7 Moteur de traitement

Le moteur doit :

- recevoir une demande libre
- enrichir le contexte avec la memoire locale
- generer une reponse exploitable par le systeme
- appliquer les fichiers produits
- executer les commandes de verification autorisees
- remonter un resultat lisible

Le systeme doit privilegier un format de reponse machine lisible de type :

- `### FILE:`
- `### PATCH:`
- `### RUN:`

Les garde-fous doivent empecher :

- les ecritures hors du depot cible
- les commandes shell dangereuses
- les traitements infinis
- l'execution d'un utilisateur Telegram non autorise

### 5.8 Memoire persistante

La memoire doit etre locale, persistante et orientee projet.

Le stockage principal doit se faire sous forme de fichiers Markdown hebdomadaires.
Chaque semaine doit produire au minimum un fichier `.md` append-only contenant les evenements et resumos utiles.

Format cible suggere :

- `MEMORY/weekly/YYYY-Www.md` pour le journal hebdomadaire global
- `MEMORY/sessions/` pour les resumos de sessions detaillees

La memoire doit enregistrer au minimum :

- date et heure
- projet concerne
- demande utilisateur
- CLI utilise
- modele utilise
- statut succes ou echec
- nombre de tentatives
- fichiers touches
- resultat des tests ou verifications
- resume de session
- notes utilisateur eventuelles

### 5.9 Recherche memoire

La recherche memoire doit combiner :

- QMD comme moteur principal d'indexation et de recherche
- BM25 comme fallback lexical
- une base de donnees vectorielle locale
- un modele d'embedding local

Exigences :

- aucun embedding distant obligatoire pour le fonctionnement nominal
- la recherche doit fonctionner hors cloud une fois le poste configure
- le systeme doit pouvoir reindexer automatiquement les nouveaux fichiers `.md`
- le systeme doit pouvoir retourner un contexte pertinent avant l'appel au CLI
- si QMD n'est pas disponible, un fallback textuel BM25 doit continuer a fonctionner

Le modele d'embedding local devra etre leger, stable et compatible Windows.
Le choix exact du modele n'est pas impose par ce cahier des charges, mais il doit etre remplacable sans refonte majeure.

### 5.10 Historique et sauvegarde

Le systeme doit permettre :

- de consulter l'historique recent d'un projet
- de sauvegarder manuellement une session
- d'ajouter des notes libres
- de retrouver les sessions precedentes via la recherche memoire

### 5.11 Multi-langue (i18n)

Le produit doit etre concu multi-langue des le depart.

Langues prioritaires MVP :

- francais (`fr`) langue par defaut initiale
- anglais (`en`) complet des le MVP

Exigences :

- Tous les textes UI Telegram et GUI doivent provenir d'un systeme de dictionnaires (pas de hardcode diffuse).
- La langue doit etre configurable par session utilisateur.
- Les tuiles, messages systeme, erreurs et aides doivent etre disponibles en `fr` et `en`.
- Si une cle de traduction manque dans la langue active, fallback automatique en `en`, puis en `fr` si necessaire.
- Le format des dates/heures doit respecter la locale active.
- La structure i18n doit permettre l'ajout ulterieur d'autres langues sans refonte.

## 6. Exigences non fonctionnelles

### 6.1 Simplicite

- Le systeme doit etre utilisable par defaut sans configuration experte.
- Les options avancees doivent etre accessibles mais non envahissantes.
- Le parcours principal doit tenir en quelques actions simples.

### 6.2 Robustesse

- L'application doit survivre a l'echec d'un CLI.
- L'application doit continuer a fonctionner si certains outils optionnels sont absents.
- Les erreurs doivent etre comprensibles et exploitables.

### 6.3 Performance

- L'affichage d'un changement d'etat doit etre quasi instantane sur le miroir PC.
- Le demarrage ne doit pas bloquer inutilement l'interface.
- La recherche memoire doit rester fluide sur un historique de plusieurs semaines.

### 6.4 Confidentialite

- Les donnees de memoire restent locales par defaut.
- Les journaux et fichiers de session ne doivent pas quitter la machine sans action explicite.
- L'acces Telegram doit etre restreint a un identifiant autorise.

### 6.5 Portabilite

- La cible initiale est Windows.
- L'architecture doit rester adaptable a Linux et macOS.

## 7. Architecture cible

### 7.1 Base technique

- Runtime : Node.js
- Bot : Telegraf
- Interface locale : Electron
- Execution de commandes : Execa
- Memoire / recherche : QMD + BM25 + stockage vectoriel local
- Stockage documentaire : fichiers Markdown

### 7.2 Modules principaux

- `index.js` : orchestration generale, Telegram, Electron, routing des actions
- `utils/cli-detector.js` : detection et parametrage des CLI
- `utils/agents.js` : appel des CLI et fallback
- `utils/actions.js` : application des fichiers, verification, garde-fous
- `utils/memory.js` : memoire persistante, indexation, recherche
- `utils/ui.js` : tuiles, menus et textes UI
- `utils/ide-manager.js` : detection et lancement des IDE

## 8. Hors perimetre initial

Ne font pas partie du MVP, sauf arbitrage ulterieur :

- collaboration multi-utilisateur simultanee
- synchronisation cloud de la memoire
- application mobile native dediee
- edition collaborative temps reel dans l'interface Electron
- support complet multi-OS des la premiere version

## 9. Critieres d'acceptation MVP

Le MVP sera considere comme valide si :

1. Un utilisateur peut selectionner un projet depuis Telegram et voir le meme etat sur le PC.
2. Un utilisateur peut envoyer une demande libre et obtenir un traitement de code sur le projet actif.
3. Le systeme choisit un CLI disponible ou applique automatiquement un fallback en cas d'echec ou de limite.
4. Les actions de configuration principales sont accessibles sous forme de tuiles.
5. Un IDE peut etre ouvert sur le projet actif depuis Telegram ou depuis le miroir PC.
6. Les sessions sont journalisees en Markdown hebdomadaire.
7. La recherche memoire fonctionne avec QMD en nominal et BM25 en fallback.
8. La memoire s'appuie sur une indexation locale et un modele d'embedding local.
9. Le systeme reste utilisable meme si certains CLI ou composants optionnels sont absents.
10. L'interface locale est lisible, kawaii et comprensible sans documentation technique.
11. L'interface Telegram + GUI est disponible en francais et en anglais avec bascule de langue.

## 10. Evolutions souhaitees apres MVP

- ouverture d'un fichier precis ou d'une selection de fichiers dans l'IDE choisi
- detection automatique du dossier actif depuis l'IDE
- suggestions de CLI selon le type de tache
- resumes hebdomadaires automatiques
- filtres d'historique par projet, CLI, statut et semaine
- parametres avances pour la politique de fallback
- profils utilisateur de configuration

## 11. Resume executif

VibeRemote doit devenir une couche d'orchestration locale, humaine et accessible au-dessus de plusieurs CLI de code.
Son coeur de valeur est de permettre a l'utilisateur de piloter simplement son developpement depuis Telegram tout en gardant un miroir visuel rassurant sur le PC, avec une vraie tolerance aux erreurs grace au fallback multi-CLI et une memoire locale durable exploitable par recherche hybride.
