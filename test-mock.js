/**
 * SCRIPT DE TEST DE SIMULATION (MOCK)
 * Ce script valide la logique interne de VibeCoder Orchestrator sans avoir besoin
 * de gemini-cli, codex-cli ou de l'API Telegram.
 */

import { applyCodeToFiles, executeAndTest } from './utils/actions.js';

// --- MOCKS ---

// Simulation d'une réponse du Tech Lead
const mockLlmOutput = `
Certes, voici le code demandé pour créer un fichier de test.

### FILE: test_output/hello.js
\`\`\`javascript
console.log("Hello from VibeCoder!");
\`\`\`

### RUN: node test_output/hello.js
`;

async function testWorkflow() {
    console.log("--- DÉBUT DU TEST DE SIMULATION ---");
    const REPO_PATH = process.cwd();

    try {
        // 1. Test du Parsing et de l'Écriture
        console.log("\n1. Test de applyCodeToFiles...");
        const files = await applyCodeToFiles(mockLlmOutput, REPO_PATH);
        console.log("Fichiers identifiés et écrits :", files);

        if (files.includes('test_output/hello.js')) {
            console.log("✅ Écriture réussie.");
        } else {
            console.log("❌ Échec de l'écriture.");
        }

        // 2. Test de l'Exécution (### RUN:)
        console.log("\n2. Test de executeAndTest...");
        const testResult = await executeAndTest(mockLlmOutput, REPO_PATH);

        if (testResult.success) {
            console.log("✅ Test d'exécution réussi !");
            console.log("Sortie :", testResult.message);
        } else {
            console.log("❌ Échec du test d'exécution.");
            console.log("Erreur :", testResult.error);
        }

        console.log("\n--- TEST TERMINÉ AVEC SUCCÈS ---");
        console.log("Note: Le dossier 'test_output' a été créé pour ce test.");

    } catch (err) {
        console.error("\n❌ Erreur pendant le test :", err);
    }
}

testWorkflow();
