/**
 * Hello Vibe - Script de validation pour VibeCoder Orchestrator
 * 
 * Ce script teste la chaîne de déploiement de l'orchestrateur
 * avec un cas d'usage simple et modulaire (ESM).
 */

const MESSAGE = 'Hello, VibeCoder! 🚀';

/**
 * Affiche le message de bienvenue
 * @returns {string} Le message Hello Vibe
 */
function helloVibe() {
    console.log(MESSAGE);
    return MESSAGE;
}

// Exécution principale
helloVibe();

// Export pour tests et modularité
export { helloVibe, MESSAGE };
