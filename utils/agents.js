import { execa } from 'execa';
import { buildAgentConfig, getFormattedArgs } from './cli-detector.js';

/**
 * PIPELINE MULTI-AGENTS
 * 
 * Les agents sont orchestrés avec un système de fallback dynamique.
 * La configuration des outils est centralisée dans cli-detector.js.
 */

// Variable persistante pour la configuration chargée
let GLOBAL_CONFIG = null;

async function ensureConfig() {
    if (!GLOBAL_CONFIG) {
        GLOBAL_CONFIG = await buildAgentConfig();
    }
    return GLOBAL_CONFIG;
}

// Appel à l'Agent Architecte (Planification)
export async function runArchitectAgent(prompt, context, options = {}) {
    const config = await ensureConfig();
    const { defaultCli, defaultModel, disabledClis = [] } = options;

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

    const result = await executeLimiter(fullPrompt, config.architect, { defaultCli, defaultModel, disabledClis });
    return { output: result.output, usedCli: result.usedCli };
}

// Appel à l'Agent Développeur (Génération de code)
export async function runDeveloperAgent(plan, context, errorMessage = null, options = {}) {
    const config = await ensureConfig();
    const { defaultCli, defaultModel, preferredCli, disabledClis = [] } = options;

    let fullPrompt = `Tu es une IA Développeur Full-Stack Senior.
Ton rôle est d'écrire le code fonctionnel, propre et optimisé en suivant strictement le plan de l'Architecte.

CONSIGNES :
- Utilise les meilleures pratiques du langage concerné.
- Inclus la gestion d'erreurs et des commentaires pertinents.
- Assure-toi que le code est immédiatement exécutable.

CONTEXTE MÉMOIRE (QMD) :
${context}

PLAN DE l'ARCHITECTE :
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

    const cliToUse = preferredCli || defaultCli;
    const result = await executeLimiter(fullPrompt, config.developer, { defaultCli: cliToUse, defaultModel, disabledClis });
    return { output: result.output, usedCli: result.usedCli };
}

// Appel à l'Agent Tech Lead (Formatage final et consignes strictes)
export async function runTechLeadAgent(developerCode, options = {}) {
    const config = await ensureConfig();
    const { defaultCli, defaultModel, preferredCli, disabledClis = [] } = options;

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

IMPORTANT : Assure-toi qu'il n'y a AUCUN espace ou texte parasite entre le marqueur ### FILE: et le début du bloc de code (\`\`\`).

ZÉRO TEXTE INTRODUCTIF. ZÉRO BLA-BLA. JUSTE LE FORMAT TECHNIQUE.

CODE À TRAITER :
${developerCode}`;

    const cliToUse = preferredCli || defaultCli;
    const result = await executeLimiter(fullPrompt, config.techlead, { defaultCli: cliToUse, defaultModel, disabledClis });
    return { output: result.output, usedCli: result.usedCli };
}

/**
 * Exécute l'appel CLI avec fallback
 */
async function executeLimiter(prompt, configList, options = {}) {
    const { defaultCli = null, defaultModel = null, disabledClis = [] } = options;
    let lastError = null;

    let agentsToTry = configList.filter(agent => !disabledClis.includes(agent.cmd));

    if (agentsToTry.length === 0) {
        throw new Error("Aucun CLI disponible (tous désactivés).");
    }

    if (defaultCli && !disabledClis.includes(defaultCli)) {
        const defaultIdx = agentsToTry.findIndex(a => a.cmd === defaultCli);
        if (defaultIdx !== -1) {
            const agent = agentsToTry.splice(defaultIdx, 1)[0];
            agentsToTry.unshift(agent);
        }
    }

    for (const agentConfig of agentsToTry) {
        try {
            console.log(`[Agent] Tentative avec ${agentConfig.cmd}...`);

            // Construction des arguments via la source de vérité
            const formatted = getFormattedArgs(agentConfig.cmd, defaultModel, prompt);
            const fullArgs = formatted.args;
            const input = formatted.input;  // Prompt pour stdin si nécessaire

            const result = await execa(agentConfig.cmd, fullArgs, {
                stdin: input ? 'pipe' : 'ignore',  // stdin: 'pipe' si on passe un prompt
                input: input,  // Le prompt via stdin
                stdout: 'pipe',
                stderr: 'pipe',
                timeout: 60000, // Augmenté à 60s pour les prompts complexes
                shell: process.platform === 'win32', // Ajustement pour Windows
                windowsHide: true, // Éviter AttachConsole failed sur Windows
                reject: false,     // Ne pas crash sur erreur CLI, on veut le fallback
                stripFinalNewline: true
            });

            if (result.failed || result.exitCode !== 0 || !result.stdout.trim()) {
                console.warn(`[Agent] ${agentConfig.cmd} sortie vide ou erreur. Exit: ${result.exitCode}, Stdout length: ${result.stdout?.length || 0}`);
                throw new Error(result.stderr || `Code de sortie: ${result.exitCode}`);
            }

            console.log(`[Agent] ${agentConfig.cmd} réussi. Output length: ${result.stdout.length}`);
            return { output: result.stdout, usedCli: agentConfig.cmd };
        } catch (error) {
            console.warn(`[Agent] Échec de ${agentConfig.cmd}: ${error.message}`);
            lastError = error;
        }
    }

    throw new Error(`Échec global. Dernier message: ${lastError?.message}`);
}

export { buildAgentConfig };
