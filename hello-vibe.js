/**
 * @file hello-vibe.js
 * @description Script minimaliste pour valider la chaîne de déploiement VibeCoder Orchestrator.
 * @version 1.0.0
 * @license MIT
 */

// Export d'une constante pour tester la modularité ESM (Phase B.1)
export const GREETING = "Hello from VibeCoder Orchestrator v2.5!";

/**
 * Fonction principale affichant le message de bienvenue avec gestion d'erreurs (Phase C.3).
 */
export function sayHello() {
    try {
        console.log("\n=========================================");
        console.log(GREETING);
        console.log(`Horodatage : ${new Date().toISOString()}`);
        console.log("Statut : Pipeline validé avec succès.");
        console.log("=========================================\n");
    } catch (error) {
        console.error("Erreur lors de l'exécution du script hello-vibe :", error.message);
        process.exit(1);
    }
}

// Exécution si le script est lancé directement par Node (Phase C.1)
const isMainModule = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('hello-vibe.js');
if (isMainModule) {
    sayHello();
}
