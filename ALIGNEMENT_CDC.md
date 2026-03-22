# Alignement Code vs Cahier Des Charges

Date de reference : 2026-03-22
Source cible : [CAHIER_DES_CHARGES.md](./CAHIER_DES_CHARGES.md)

## Lecture rapide

- `OK` : implemente et visible dans le code actuel.
- `PARTIEL` : present mais incomplet vs cible.
- `GAP` : manquant.

## 1. Interfaces Et Pilotage

1. Telegram + miroir PC synchronises
Statut : `OK`
Preuve :
- [index.js](./index.js)
- [gui/renderer.js](./gui/renderer.js)
- [gui/preload.js](./gui/preload.js)

2. Actions config sous forme de tuiles
Statut : `OK`
Preuve :
- [utils/ui.js](./utils/ui.js)
- handlers `bot.action` et `ipcMain.on('gui-action')` dans [index.js](./index.js)

3. Parcours ultra-simple "je choisis un dossier et je demande"
Statut : `PARTIEL`
Concret :
- selection projet et demande libre existent
- pas encore de detection automatique du dossier "courant utilisateur" sans selection explicite
Zone :
- [index.js](./index.js)

## 2. Multi-CLI Et Fallback

1. Detection CLI disponibles
Statut : `OK`
Preuve :
- [utils/cli-detector.js](./utils/cli-detector.js)

2. Fallback multi-CLI en cas d'echec
Statut : `OK`
Preuve :
- [utils/agents.js](./utils/agents.js)

3. Tracabilite fine des causes de fallback
Statut : `OK`
Concret :
- traces structurees par tentative (cli, status, reason, duration, exitCode, timeout, message)
- persistance des traces dans la memoire locale
Zone :
- [utils/agents.js](./utils/agents.js)
- [utils/memory.js](./utils/memory.js)
- [index.js](./index.js)

## 3. Multi-IDE

1. Detection IDE + ouverture + fallback
Statut : `OK`
Preuve :
- [utils/ide-manager.js](./utils/ide-manager.js)
- action `action:open_ide` dans [index.js](./index.js)

2. Configuration IDE via tuiles
Statut : `OK`
Preuve :
- [utils/ui.js](./utils/ui.js)

## 4. Memoire Et Recherche

1. Journal persistant hebdomadaire `.md`
Statut : `OK`
Concret :
- le journal quotidien reste present
- ecriture hebdomadaire activee dans `MEMORY/weekly/YYYY-Www.md`
Zone :
- [utils/memory.js](./utils/memory.js)

2. Sessions detaillees en Markdown
Statut : `OK`
Preuve :
- [utils/memory.js](./utils/memory.js)

3. Recherche QMD nominal + BM25 fallback
Statut : `OK`
Preuve :
- [utils/memory.js](./utils/memory.js)

4. Base vectorielle locale explicite + embedding local configurable
Statut : `OK`
Concret :
- backend vectoriel local explicite (`json`) dans `MEMORY/vector/index.json`
- embedding local configurable via `.env` (`MEMORY_EMBED_MODEL`, `MEMORY_VECTOR_DIM`)
- fallback vectoriel active entre QMD et BM25
Zone :
- [utils/memory.js](./utils/memory.js)
- [setup.js](./setup.js)

## 5. Multi-Langue FR/EN

1. Base i18n centralisee
Statut : `OK`
Preuve :
- [utils/i18n.js](./utils/i18n.js)

2. FR + EN disponibles
Statut : `OK`
Preuve :
- dictionnaires `fr` et `en` dans [utils/i18n.js](./utils/i18n.js)

3. Bascule langue par session
Statut : `OK`
Preuve :
- `session.locale` + `/lang` + `set_lang:*` dans [index.js](./index.js)

4. Bascule miroir GUI
Statut : `PARTIEL`
Concret :
- mise a jour dynamique de plusieurs libelles GUI en place
- certains textes restent statiques en dur dans le HTML initial
Zone :
- [gui/index.html](./gui/index.html)
- [gui/renderer.js](./gui/renderer.js)

5. Hardcodes utilisateurs restants
Statut : `PARTIEL`
Concret :
- la majorite des messages critiques est i18n
- il reste des chaines operationnelles en francais dans certains retours techniques
Zone :
- [index.js](./index.js)
- [utils/actions.js](./utils/actions.js)

## 6. Accessibilite Kawaii

1. Interface kawaii presente
Statut : `OK`
Preuve :
- [gui/index.html](./gui/index.html)
- [gui/style.css](./gui/style.css)

2. Checklist accessibilite formelle (focus clavier, contraste, labels, etc.)
Statut : `PARTIEL`
Zone :
- [gui/index.html](./gui/index.html)
- [gui/style.css](./gui/style.css)
- [ACCESSIBILITE_CHECKLIST.md](./ACCESSIBILITE_CHECKLIST.md)

## 7. Securite Execution

1. Protection path traversal
Statut : `OK`
Preuve :
- `resolvePathInsideRepo` dans [utils/actions.js](./utils/actions.js)

2. Durcissement `### RUN`
Statut : `OK`
Preuve :
- parse de commande + `shell: false` dans [utils/actions.js](./utils/actions.js)

## 8. Tests Et Qualite

1. Suite de tests automatises
Statut : `OK`
Concret :
- suite de tests automatises en process unique (`npm test`)
Zone :
- [package.json](./package.json)
- [tests/run-tests.mjs](./tests/run-tests.mjs)
- [tests/actions.test.mjs](./tests/actions.test.mjs)
- [tests/memory.test.mjs](./tests/memory.test.mjs)
- [tests/i18n.test.mjs](./tests/i18n.test.mjs)

## 9. Priorites De Fermeture D'ecarts

1. Implementer la memoire hebdomadaire `MEMORY/weekly/YYYY-Www.md`.
2. Finaliser l'i18n GUI (supprimer les hardcodes restants).
3. Finaliser l'accessibilite (audit contraste WCAG + lecteur d'ecran).
