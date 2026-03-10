# VibeCoder Orchestrator

**Version:** 2.5
**Description:** Assistant de code multi-agents autonome fonctionnant via Telegram, permettant de gérer et de développer des projets locaux de manière assistée.
**Langage:** Node.js
**Frameworks principaux:** Telegraf, Execa

## Fonctionnalités Principales

VibeCoder Orchestrator repose sur un pipeline d'agents IA spécialisés, avec une gestion dynamique des CLI et un système de mémoire hybride.

### 1. Architecture Multi-Agents (`utils/agents.js`)
- **Architecte :** Analyse la demande et génère un plan d'action structuré.
- **Développeur :** Écrit le code complet selon les directives de l'Architecte.
- **Tech Lead :** Formate strictement le code généré pour son extraction et exécution par le système.
- **Limiteur de Fallback :** En cas d'échec d'un CLI, l'orchestrateur passe dynamiquement au suivant selon une chaîne de priorité (configurable).

### 2. Détection Dynamique des CLI (`utils/cli-detector.js`)
- Le système scanne localement les CLI disponibles (`claude`, `gemini`, `codex`, `qwen`, `opencode`).
- Chaque CLI a une configuration propre pour acheminer correctement le prompt (via `stdin`, `--prompt`, ou positionnellement).
- La récupération des modèles disponibles est dynamique si le CLI le permet (ex: `opencode models`).

### 3. Système de Mémoire Hybride RAG (`utils/memory.js`)
- **Backend QMD :** Indexation automatique et recherche sémantique avec reranking (MMR).
- **Fallback BM25 :** Recherche textuelle simple si QMD n'est pas disponible.
- **Daily Log & Sessions :** Sauvegarde des requêtes, des résumés générés, des fichiers impactés et du statut de réussite dans des fichiers Markdown.

### 4. Interface Telegram (`index.js` & `utils/ui.js`)
L'orchestrateur est contrôlé intégralement via un bot Telegram avec claviers interactifs (`InlineKeyboardMarkup`).
- `/start` : Menu d'accueil et guide rapide.
- `/code` : Sélection du projet local à éditer.
- `/cli` : Configuration du CLI par défaut et gestion des CLI autorisés/désactivés (via tuiles ON/OFF).
- `/model` : Choix du modèle d'IA préféré.
- `/history` : Consultation de l'historique des sessions pour le projet actuel.
- `/save` : Sauvegarde manuelle avec notes personnalisées.

## Installation et Lancement

1. Clonez ce dépôt.
2. Installez les dépendances :
   ```bash
   npm install
   ```
3. Configurez votre `.env` en incluant :
   - `BOT_TOKEN`
   - `MY_TELEGRAM_ID`
   - `BASE_PROG_PATH`
4. Lancez le bot :
   ```bash
   npm start
   ```
   *Ou exécutez le script `start.bat`.*

## Conventions de Développement

- Utilisation de `execa` pour tous les appels systèmes, configuré pour Windows (`shell: true`).
- Chaque session enregistre son état (réussite ou échec) afin d'enrichir la mémoire pour les requêtes futures.
- Le formatage du Tech Lead commence obligatoirement par `### FILE:` pour la détection du code, sans aucun blabla optionnel.

## Dépendances clés
- `telegraf`
- `execa`
- `dotenv`

---
*Ce README a été généré automatiquement dans le cadre de la vérification et du nettoyage du projet VibeCoder.*
