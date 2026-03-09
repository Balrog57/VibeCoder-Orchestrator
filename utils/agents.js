import { execa } from 'execa';

/**
 * CONFIGURATION DES PRIORITÉS PAR RÔLE
 * Chaque rôle essaie les commandes dans l'ordre de la liste.
 */
const CONFIG = {
    // Architecte : Claude Code (Opus) > Gemini Pro > Codex
    architect: [
        { cmd: 'claude', args: ['--model', 'opus', '--prompt'] },
        { cmd: 'gemini', args: ['--prompt'] },
        { cmd: 'codex', args: ['run'] }
    ],
    // Développeur : Codex > Claude Sonnet > Gemini Flash
    developer: [
        { cmd: 'codex', args: ['run'] },
        { cmd: 'claude', args: ['--model', 'sonnet', '--prompt'] },
        { cmd: 'gemini', args: ['--prompt'] }
    ],
    // Tech Lead : Claude Sonnet > Gemini Pro > Codex
    techlead: [
        { cmd: 'claude', args: ['--model', 'sonnet', '--prompt'] },
        { cmd: 'gemini', args: ['--prompt'] },
        { cmd: 'codex', args: ['run'] }
    ]
};

// Appel à l'Agent Architecte (Planification)
export async function runArchitectAgent(prompt, context) {
    const fullPrompt = `Tu es un Architecte Logiciel.
Ton rôle est d'analyser la demande de l'utilisateur et le contexte existant, puis de générer un plan d'action d'implémentation clair.
NE GÉNÈRE PAS DE CODE. Fournis uniquement les étapes nécessaires.

CONTEXTE MÉMOIRE (QMD) :
${context}

DEMANDE UTILISATEUR :
${prompt}`;

    return await executeLimiter(fullPrompt, CONFIG.architect);
}

// Appel à l'Agent Développeur (Génération de code)
export async function runDeveloperAgent(plan, context, errorMessage = null) {
    let fullPrompt = `Tu es une IA Développeur Senior.
Ton rôle est d'écrire le code fonctionnel en suivant le plan de l'Architecte.

CONTEXTE MÉMOIRE (QMD) :
${context}

PLAN DE L'ARCHITECTE :
${plan}
`;

    if (errorMessage) {
        fullPrompt += `
ATTENTION : La précédente exécution a échoué avec l'erreur suivante :
${errorMessage}
Corrige ton code en conséquence.
`;
    }

    return await executeLimiter(fullPrompt, CONFIG.developer);
}

// Appel à l'Agent Tech Lead (Formatage final et consignes strictes)
export async function runTechLeadAgent(developerCode) {
    const fullPrompt = `Tu es le Tech Lead.
Ton rôle est de prendre le code fourni par le Développeur, de le vérifier, et de le formater STRICTEMENT selon les consignes ci-dessous pour l'orchestrateur.

CONSIGNES STRICTES DE FORMATAGE (OBLIGATOIRE) :
1. Pour CHAQUE fichier à créer ou modifier, tu dois utiliser ce format exact :
### FILE: chemin/vers/le/fichier.ext
\`\`\`language
// le code complet du fichier
\`\`\`

2. Pour la commande de test à exécuter après l'écriture, tu dois utiliser ce format exact (À la toute fin) :
### RUN: commande de test à lancer

CODE DU DÉVELOPPEUR À FORMATER :
${developerCode}`;

    return await executeLimiter(fullPrompt, CONFIG.techlead);
}

/**
 * Fonction utilitaire pour exécuter l'appel CLI avec une liste de priorités (fallback)
 */
async function executeLimiter(prompt, configList) {
    let lastError = null;

    for (const agentConfig of configList) {
        try {
            console.log(`[Agent] Tentative avec ${agentConfig.cmd}...`);
            const fullArgs = [...agentConfig.args, prompt];

            let result;
            if (agentConfig.cmd === 'gemini') {
                // On pipe "3" pour répondre "No, don't ask again" à la question interactive d'Antigravity
                result = await execa({ shell: true })`${agentConfig.cmd} ${fullArgs.map(a => `"${a}"`).join(' ')} << "3"`;
            } else {
                result = await execa(agentConfig.cmd, fullArgs);
            }

            return result.stdout;
        } catch (error) {
            console.warn(`[Agent] Échec de ${agentConfig.cmd}: ${error.message}`);
            lastError = error;
        }
    }

    console.error(`[Agent] Échec critique : tous les agents de la pipeline ont échoué.`);
    throw new Error(`Échec de génération global. Dernier message: ${lastError?.message || 'Inconnu'}`);
}
