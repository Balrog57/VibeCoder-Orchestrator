# VibeCoder Orchestrator

## Aperçu du Projet & Stack Technique
**Projet:** VibeCoder Orchestrator v2.1
**Description:** Un bot Telegram agissant comme un ingénieur logiciel autonome, communiquant via CLI avec les LLM (Gemini, Codex).
**Langage:** Node.js (v18+) avec modules ESM.
**Frameworks principaux:** 
- `telegraf` (Bot Telegram)
- `execa` (Orchestration système sécurisée)
- `dotenv` (Configuration)

**Dépendances clés:**
- Aucune utilisation de SDK d'API REST (pas de `@google/generative-ai` ou `openai`).
- Pilotage IA exclusif via `gemini-cli` et `codex-cli`.
- RAG local avec l'outil `qmd`.

## Architecture du Code
- `index.js` : Point d'entrée, initialisation Telegraf, boucle d'exécution autonome.
- `utils/memory.js` : Gestion de la mémoire via `qmd` et sauvegarde/lecture de markdown.
- `utils/agents.js` : Pipeline multi-agents itérative (Architecte -> Développeur -> Tech Lead).
- `utils/actions.js` : Parsing Regex, exécution locale des commandes (`execa`) et gestion Git.
- `memory/` : Répertoire contenant l'historique de session et les informations gérées par QMD.

## Commandes et Environnement (Windows OS)
- **Installation :**
  ```powershell
  npm install
  ```
- **Lancement :**
  ```powershell
  node index.js
  ```
- **Configuration :** Fichier `.env` requis à la racine contenant au minimum `BOT_TOKEN` et `MY_TELEGRAM_ID`.

## Conventions de Développement
- Utilisation stricte de l'ESM (`import`/`export`).
- La validation des identités via `MY_TELEGRAM_ID` doit être totalement silencieuse pour les non-autorisés.
- Ne jamais utiliser le mode "Zero-Shot" ; toujours recourir à la pipeline Architecte -> Dév -> Tech Lead.
- Utilisation de `execa` avec arguments en tableau (ex: `['--prompt', myPrompt]`) pour empêcher l'injection de commandes.
- Commit Git local obligatoire après un succès validé.

## Registre des Erreurs Documentées
Ici seront enregistrées toutes les erreurs bloquantes résolues.

#### ERREUR : [Template]
- **CAUSE** : [Description de la cause]
- **SOLUTION** : [Adaptation du code]
