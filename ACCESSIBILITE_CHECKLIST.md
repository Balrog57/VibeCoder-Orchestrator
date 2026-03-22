# Checklist Accessibilite UI (MVP)

Date : 2026-03-22
Perimetre : GUI Electron (`gui/index.html`, `gui/style.css`, `gui/renderer.js`)

## 1. Navigation clavier

- [x] Focus visible sur les boutons tuiles (`.tile-btn:focus-visible`)
- [x] Focus visible sur le bouton envoyer (`#send-btn:focus-visible`)
- [x] Focus visible sur le champ de saisie (`#user-input:focus-visible`)

## 2. Lisibilite

- [x] Zones de texte principales contrastées sur fond clair
- [x] Taille de police lisible pour messages et boutons
- [x] Etat systeme distinct visuellement (bulle de statut)
- [x] Contraste de base vérifié automatiquement (test accessibilité)

## 3. Libelles et compréhension

- [x] Boutons avec textes explicites (pas uniquement des icones)
- [x] Placeholder de saisie compréhensible
- [x] Message d'accueil orientant l'utilisateur

## 4. Multi-langue

- [x] Libelles GUI principaux adaptables FR/EN
- [x] Textes critiques (welcome, repo, input, send) mis à jour selon locale

## 5. Limites connues

- [x] Audit contraste de base automatisé (AA texte normal sur couleurs principales)
- [ ] Test lecteur d'écran manuel (NVDA/VoiceOver) non exécuté
- [ ] Test responsive mobile non applicable (app desktop Electron)
