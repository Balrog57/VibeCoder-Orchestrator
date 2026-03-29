# Remote Security Notes

Date de reference : 2026-03-29

## Objectif

Ce document resume les garde-fous du mode remote de VibeRemote.

## Modes de permission

- `local`
  - le comportement historique
  - les actions locales s'executent directement
- `confirm_remote`
  - demande une validation avant les actions sensibles
  - couvre actuellement `open_ide`, `open_run_ide`, `set_workspace_mode:worktree`
- `strict`
  - etend `confirm_remote`
  - ajoute `create_repo` et `manual_save`

## Etat persistant

- les sessions sont sauvegardees dans `.viberemote/session-state.json`
- l'etat de service remote est sauvegarde dans `.viberemote/runtime-state.json`
- au redemarrage :
  - un run en cours est remis en etat sur
  - une permission en attente reste visible
  - les workspaces ephemeres sont resolus a nouveau a la demande

## Limites actuelles

- l'approbation distante couvre surtout les actions locales les plus sensibles
- l'ouverture d'IDE et le passage en `worktree` sont proteges, mais ce n'est pas encore un systeme d'ACL complet
- le service remote reste un process desktop local, pas un daemon systeme separe

## Recommandations

- garder `local` pour usage purement personnel sur la machine
- passer en `confirm_remote` pour Telegram ou usage multi-surface
- utiliser `strict` si tu veux un mode remote plus prudent pendant les tests
