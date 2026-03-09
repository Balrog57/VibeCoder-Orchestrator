import { execa } from 'execa';

/**
 * CONFIGURATION DES PRIORITÉS PAR RÔLE
 * Chaque rôle essaie les commandes dans l'ordre de la liste.
 */
const CONFIG = {
    // Architecte : Claude Code (Opus) > Gemini Pro > Qwen > OpenCode > Codex
    architect: [
        { cmd: 'claude', args: ['--model', 'opus', '-p'] },
        { cmd: 'gemini', args: ['--yolo', '-p'] },
        { cmd: 'qwen', args: ['--yolo'] },
        { cmd: 'opencode', args: ['run'] },
        { cmd: 'codex', args: ['exec'] }
    ],
    // Développeur : Codex > Claude Sonnet > Gemini Flash > Qwen > OpenCode
    developer: [
        { cmd: 'codex', args: ['exec'] },
        { cmd: 'claude', args: ['--model', 'sonnet', '-p'] },
        { cmd: 'gemini', args: ['--yolo', '-p'] },
        { cmd: 'qwen', args: ['--yolo'] },
        { cmd: 'opencode', args: ['run'] }
    ],
    // Tech Lead : Claude Sonnet > Gemini Pro > Qwen > OpenCode > Codex
    techlead: [
        { cmd: 'claude', args: ['--model', 'sonnet', '-p'] },
        { cmd: 'gemini', args: ['--yolo', '-p'] },
        { cmd: 'qwen', args: ['--yolo'] },
        { cmd: 'opencode', args: ['run'] },
        { cmd: 'codex', args: ['exec'] }
    ]
};

// Appel à l'Agent Architecte (Planification)
export async function runArchitectAgent(prompt, context) {
    const fullPrompt = `Tu es un Architecte Logiciel Senior.
Ton rôle est d'analyser la demande de l'utilisateur et le contexte existant, puis de générer un plan d'action d'implémentation robuste et élégant.

OBJECTIFS :
1. Définir une architecture modulaire et scalable.
2. Identifier les composants impactés.
3. Prévoir les étapes d'implémentation logicalment ordonnées.

NE GÉNÈRE PAS DE CODE. Fournis uniquement les étapes nécessaires sous forme de plan stratégique.

CONTEXTE MÉMOIRE (QMD) :
${context}

DEMANDE UTILISATEUR :
${prompt}`;

    return await executeLimiter(fullPrompt, CONFIG.architect);
}

// Appel à l'Agent Développeur (Génération de code)
export async function runDeveloperAgent(plan, context, errorMessage = null) {
    let fullPrompt = `Tu es une IA Développeur Full-Stack Senior.
Ton rôle est d'écrire le code fonctionnel, propre et optimisé en suivant strictement le plan de l'Architecte.

CONSIGNES :
- Utilise les meilleures pratiques du langage concerné.
- Inclus la gestion d'erreurs et des commentaires pertinents.
- Assure-toi que le code est immédiatement exécutable.

CONTEXTE MÉMOIRE (QMD) :
${context}

PLAN DE L'ARCHITECTE :
${plan}
`;

    if (errorMessage) {
        fullPrompt += `
⚠️ ERREUR CRITIQUE À CORRIGER :
La précédente exécution a échoué avec l'erreur suivante :
${errorMessage}
Analyse la cause racine et corrige ton implémentation.
`;
    }

    return await executeLimiter(fullPrompt, CONFIG.developer);
}

// Appel à l'Agent Tech Lead (Formatage final et consignes strictes)
export async function runTechLeadAgent(developerCode) {
    const fullPrompt = `Tu es le Tech Lead et Garant de la Qualité.
Ton rôle est de prendre le code du Développeur, d'en assurer la validité technique, et de le formater STRICTEMENT pour l'orchestrateur système.

CONSIGNES DE FORMATAGE (OBLIGATOIRE) :
1. Formate chaque fichier avec ce marqueur précis :
### FILE: chemin/vers/fichier.ext
\`\`\`language
// code complet
\`\`\`

2. Spécifie la commande de test finale tout à la fin :
### RUN: commande_de_test

ZÉRO TEXTE INTRODUCTIF. ZÉRO BLA-BLA. JUSTE LE FORMAT TECHNIQUE.

CODE À TRAITER :
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
            if (agentConfig.cmd === 'gemini' || agentConfig.cmd === 'qwen') {
                // On passe "3\n" dans stdin pour répondre à l'éventuelle question d'Antigravity
                result = await execa(agentConfig.cmd, fullArgs, { input: "3\n" });
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
