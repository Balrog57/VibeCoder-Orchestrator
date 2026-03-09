import { execa } from 'execa';

/**
 * CONFIGURATION DES PRIORITÉS PAR RÔLE
 * 
 * Analyse des forces par outil :
 * - Claude: Meilleur en planification/architecture (payant)
 * - Gemini: Meilleur en réflexion et UI (payant, free tier dispo)
 * - Codex: Rapide pour tâches courtes (payant)
 * - Qwen: Équilibré, bon compromis (gratuit)
 * - OpenCode: Dépend du modèle, dernier recours gratuit
 * 
 * Ordre de fallback optimisé par rôle et coût
 */

// Configuration statique par défaut
const DEFAULT_CONFIG = {
    // Architecte - Modèles intelligents pour la planification (Claude, Gemini)
    architect: [
        { cmd: 'claude', args: ['-p'], promptAfterArgs: true, tier: 'premium' },
        { cmd: 'gemini', args: ['--yolo', '-p'], promptAfterArgs: true, tier: 'freemium' },
        { cmd: 'qwen', args: ['--yolo', '-p'], promptAfterArgs: true, tier: 'freemium' },
        { cmd: 'codex', args: ['exec'], promptAfterArgs: true, tier: 'premium' },
        { cmd: 'opencode', args: ['run'], promptAfterArgs: true, tier: 'free' }
    ],
    // Développeur - Bons en code, économiques (Codex rapide, Qwen équilibré)
    developer: [
        { cmd: 'codex', args: ['exec'], promptAfterArgs: true, tier: 'premium' },
        { cmd: 'qwen', args: ['--yolo', '-p'], promptAfterArgs: true, tier: 'freemium' },
        { cmd: 'gemini', args: ['--yolo', '-p'], promptAfterArgs: true, tier: 'freemium' },
        { cmd: 'claude', args: ['-p'], promptAfterArgs: true, tier: 'premium' },
        { cmd: 'opencode', args: ['run'], promptAfterArgs: true, tier: 'free' }
    ],
    // Tech Lead - Modèles intelligents pour réflexion/formatage (Gemini en tête)
    techlead: [
        { cmd: 'gemini', args: ['--yolo', '-p'], promptAfterArgs: true, tier: 'freemium' },
        { cmd: 'claude', args: ['-p'], promptAfterArgs: true, tier: 'premium' },
        { cmd: 'qwen', args: ['--yolo', '-p'], promptAfterArgs: true, tier: 'freemium' },
        { cmd: 'codex', args: ['exec'], promptAfterArgs: true, tier: 'premium' },
        { cmd: 'opencode', args: ['run'], promptAfterArgs: true, tier: 'free' }
    ]
};

/**
 * Construit la configuration des agents basée sur les CLI disponibles
 * @returns {Promise<Object>} Configuration des agents
 */
export async function buildAgentConfig() {
    // Import dynamique pour éviter les cycles
    const { scanAvailableClis } = await import('./cli-detector.js');
    
    try {
        const clis = await scanAvailableClis();
        
        if (clis.length === 0) {
            console.warn('[AgentConfig] Aucun CLI disponible, utilisation de la config par défaut');
            return DEFAULT_CONFIG;
        }
        
        // Ordre de priorité par rôle (optimisé pour forces + coût)
        const priorityByRole = {
            // Architect: Modèles intelligents (Claude, Gemini) pour planification
            architect: ['claude', 'gemini', 'qwen', 'codex', 'opencode'],
            // Developer: Code + économique (Codex rapide, Qwen équilibré)
            developer: ['codex', 'qwen', 'gemini', 'claude', 'opencode'],
            // Tech Lead: Réflexion + formatage (Gemini en tête)
            techlead: ['gemini', 'claude', 'qwen', 'codex', 'opencode']
        };
        
        const availableNames = clis.map(c => c.name);
        
        console.log('[AgentConfig] CLI disponibles:', availableNames.join(', '));
        
        // Construire la config pour chaque rôle
        const buildRoleConfig = (roleName) => {
            const priorityOrder = priorityByRole[roleName];
            const orderedNames = priorityOrder.filter(name => availableNames.includes(name));
            
            console.log(`[AgentConfig] ${roleName}: ${orderedNames.join(' > ')}`);
            
            return orderedNames.map(cli => {
                const args = getArgsForCli(cli);
                const tier = getTierForCli(cli);
                return { cmd: cli, args, promptAfterArgs: true, tier };
            });
        };
        
        return {
            architect: buildRoleConfig('architect'),
            developer: buildRoleConfig('developer'),
            techlead: buildRoleConfig('techlead')
        };
    } catch (err) {
        console.error('[AgentConfig] Erreur:', err.message);
        return DEFAULT_CONFIG;
    }
}

/**
 * Retourne les arguments pour un CLI donné
 */
function getArgsForCli(cliName) {
    switch (cliName) {
        case 'claude':
            return ['-p'];
        case 'gemini':
            return ['--yolo', '-p'];
        case 'qwen':
            return ['--yolo', '-p'];
        case 'opencode':
            return ['run'];
        case 'codex':
            return ['exec'];
        default:
            return ['-p'];
    }
}

/**
 * Retourne le tier (coût) pour un CLI
 */
function getTierForCli(cliName) {
    switch (cliName) {
        case 'claude':
            return 'premium';    // Payant, meilleure qualité
        case 'gemini':
            return 'freemium';   // Free tier disponible
        case 'qwen':
            return 'freemium';   // Gratuit + payant selon modèle
        case 'codex':
            return 'premium';    // Payant
        case 'opencode':
            return 'free';       // Gratuit (dépend du modèle)
        default:
            return 'unknown';
    }
}

// Export de la config par défaut pour usage immédiat
export const CONFIG = DEFAULT_CONFIG;

// Appel à l'Agent Architecte (Planification)
export async function runArchitectAgent(prompt, context, options = {}) {
    const { defaultCli, defaultModel } = options;

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

    const result = await executeLimiter(fullPrompt, CONFIG.architect, defaultCli, defaultModel);
    return { output: result.output, usedCli: result.usedCli };
}

// Appel à l'Agent Développeur (Génération de code)
export async function runDeveloperAgent(plan, context, errorMessage = null, options = {}) {
    const { defaultCli, defaultModel, preferredCli } = options;

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

    // Utiliser le même CLI que l'architecte si disponible
    const cliToUse = preferredCli || defaultCli;
    const result = await executeLimiter(fullPrompt, CONFIG.developer, cliToUse, defaultModel);
    return { output: result.output, usedCli: result.usedCli };
}

// Appel à l'Agent Tech Lead (Formatage final et consignes strictes)
export async function runTechLeadAgent(developerCode, options = {}) {
    const { defaultCli, defaultModel, preferredCli } = options;

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

    // Utiliser le même CLI que le developer si disponible
    const cliToUse = preferredCli || defaultCli;
    const result = await executeLimiter(fullPrompt, CONFIG.techlead, cliToUse, defaultModel);
    return { output: result.output, usedCli: result.usedCli };
}

/**
 * Fonction utilitaire pour exécuter l'appel CLI avec une liste de priorités (fallback)
 * @param {string} prompt - Le prompt à envoyer à l'IA
 * @param {Array} configList - La liste des configurations d'agents à essayer
 * @param {string} defaultCli - Le CLI par défaut à utiliser (optionnel)
 * @param {string} defaultModel - Le modèle par défaut à utiliser (optionnel)
 * @returns {Promise<{output: string, usedCli: string}>} Résultat + CLI utilisé
 */
async function executeLimiter(prompt, configList, defaultCli = null, defaultModel = null) {
    let lastError = null;

    // Si un CLI par défaut est spécifié, on l'utilise en premier
    let agentsToTry = [...configList];

    if (defaultCli) {
        // Trouver le CLI par défaut dans la config
        const defaultAgent = configList.find(a => a.cmd === defaultCli);
        if (defaultAgent) {
            // Le mettre en premier de la liste
            agentsToTry = [defaultAgent, ...configList.filter(a => a.cmd !== defaultCli)];
            console.log(`[Agent] CLI personnalisé: **${defaultCli}** en priorité`);
        }
    }

    for (const agentConfig of agentsToTry) {
        try {
            console.log(`[Agent] Tentative avec ${agentConfig.cmd}...`);

            // Construire les arguments avec le modèle personnalisé si spécifié
            let fullArgs = [...agentConfig.args];

            // Ajouter le modèle si spécifié et si l'outil le supporte
            const modelToUse = defaultModel || agentConfig.defaultModel;
            if (modelToUse && agentConfig.cmd !== 'opencode') {
                fullArgs.push('-m', modelToUse);
            }

            // Ajouter le prompt à la fin
            fullArgs.push(prompt);

            const result = await execa(agentConfig.cmd, fullArgs, {
                stdin: 'ignore',
                stdout: 'pipe',
                stderr: 'pipe',
                timeout: 45000,
                shell: false,
                reject: false,
                stripFinalNewline: true
            });

            // Check for actual failure conditions
            if (result.failed || result.exitCode !== 0 || !result.stdout.trim()) {
                const errorMsg = result.stderr || result.error?.message || `Exit code: ${result.exitCode}`;
                throw new Error(errorMsg);
            }

            console.log(`[Agent] ${agentConfig.cmd} réussi.`);
            // Retourne le résultat + le CLI utilisé pour le réutiliser
            return { output: result.stdout, usedCli: agentConfig.cmd };
        } catch (error) {
            console.warn(`[Agent] Échec de ${agentConfig.cmd}: ${error.message}`);
            lastError = error;
            // Continue to next agent in fallback chain
        }
    }

    console.error(`[Agent] Échec critique : tous les agents de la pipeline ont échoué.`);
    throw new Error(`Échec de génération global. Dernier message: ${lastError?.message || 'Inconnu'}`);
}
