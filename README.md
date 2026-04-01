# [WIP]VibeRemote

**Version:** 2.5
**Description:** Assistant de code multi-agents autonome fonctionnant via Telegram, permettant de gérer et de développer des projets locaux de manière assistée.
**Langage:** Node.js
**Frameworks principaux:** Telegraf, Execa

## Documentation

- Voir [CAHIER_DES_CHARGES.md](./CAHIER_DES_CHARGES.md) pour la vision produit, le perimetre fonctionnel et les criteres d'acceptation.
- Voir [BACKLOG_MVP.md](./BACKLOG_MVP.md) pour la priorisation MVP, les user stories et l'analyse des ecarts.
- Voir [USER_STORIES_TACHES.md](./USER_STORIES_TACHES.md) pour le decoupage user stories -> taches techniques.
- Voir [ALIGNEMENT_CDC.md](./ALIGNEMENT_CDC.md) pour l'etat actuel du code vs la cible CDC.
- Voir [ACCESSIBILITE_CHECKLIST.md](./ACCESSIBILITE_CHECKLIST.md) pour le suivi accessibilite MVP.

## Fonctionnalités Principales

VibeRemote repose sur un pipeline d'agents IA spécialisés, avec une gestion dynamique des CLI et un système de mémoire hybride.

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
- **Fallback Vectoriel Local :** Index JSON local (`MEMORY/vector/index.json`) + embeddings locaux configurables.
- **Fallback BM25 :** Recherche textuelle simple si QMD n'est pas disponible.
- **Daily Log & Sessions :** Sauvegarde des requêtes, des résumés générés, des fichiers impactés et du statut de réussite dans des fichiers Markdown.
- **Journal Hebdomadaire :** Écriture append-only dans `MEMORY/weekly/YYYY-Www.md`.

### 4. Interface Telegram (`index.js` & `utils/ui.js`)
L'orchestrateur est contrôlé intégralement via un bot Telegram avec claviers interactifs (`InlineKeyboardMarkup`).
- `/start` : Menu d'accueil et guide rapide.
- `/code` : Sélection du projet local à éditer.
- `/cli` : Configuration du CLI par défaut et gestion des CLI autorisés/désactivés (via tuiles ON/OFF).
- `/model` : Choix du modèle d'IA préféré.
- `/ide` : Configuration de l'IDE par défaut et des IDE autorisés/désactivés.
- `/lang` : Bascule de langue (français / anglais).
- `/history` : Consultation de l'historique des sessions pour le projet actuel.
- `/save` : Sauvegarde manuelle avec notes personnalisées.

### 5. Télécommande IDE en miroir PC (`utils/ide-manager.js`)
- Détection automatique des IDE installés (ex: Cursor, VSCode, Windsurf, JetBrains, Visual Studio).
- Sélection d'un IDE par défaut depuis Telegram ou le GUI local.
- Fallback automatique vers les autres IDE disponibles en cas d'échec de lancement.
- Tuile `🚀 Ouvrir IDE` pour ouvrir directement le projet actif sur le PC.

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
   - `DEFAULT_LOCALE` (`fr` ou `en`)
   - `MEMORY_VECTOR_BACKEND` (défaut: `json`)
   - `MEMORY_EMBED_MODEL` (défaut: `hash-v1`)
   - `MEMORY_VECTOR_DIM` (défaut: `256`)
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

## Tests

```bash
npm test
```

---
*Ce README a été généré automatiquement dans le cadre de la vérification et du nettoyage du projet VibeRemote.*
