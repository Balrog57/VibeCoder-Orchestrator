import { execa } from 'execa';
import { buildAgentConfig, getFormattedArgs } from './cli-detector.js';

/**
 * PIPELINE SIMPLE (MODE TELECOMMANDE)
 * 
 * Un seul agent qui reçoit le prompt, l'exécute avec le contexte mémoire, et renvoie le résultat formatté.
 * Le système de fallback dynamique est conservé.
 */

let GLOBAL_CONFIG = null;

async function ensureConfig() {
    if (!GLOBAL_CONFIG) {
        GLOBAL_CONFIG = await buildAgentConfig();
    }
    return GLOBAL_CONFIG;
}

export async function runVibeAgent(prompt, context, errorMessage = null, options = {}) {
    const config = await ensureConfig();
    const { defaultCli, defaultModel, preferredCli, disabledClis = [] } = options;

    let fullPrompt = `Tu es une IA Développeur Full-Stack Senior et autonome.
Ton rôle est d'accomplir la tâche demandée et de retourner UNIQUEMENT la réponse formatée.

CONTEXTE MÉMOIRE (QMD) :
${context}

RÈGLES ABSOLUES DE FORMATAGE :
SI TU DOIS MODIFIER OU CRÉER DES FICHIERS, TU DOIS OBLIGATOIREMENT UTILISER L'UN DES DEUX FORMATS CI-DESSOUS.
TA RÉPONSE DOIT COMMENCER DIRECTEMENT PAR "### FILE:" OU "### PATCH:" SANS AUCUN TEXTE AVANT.

1. Pour CRÉER ou RÉÉCRIRE TOTALEMENT un fichier :
### FILE: src/chemin/vers/fichier.ext
\`\`\`langage
// Code complet ici
\`\`\`

2. Pour MODIFIER UN FICHIER EXISTANT (Patching intelligent) :
### PATCH: src/chemin/vers/fichier.ext
<<<<
Ligne exacte du code original à remplacer (Garde l'indentation identique)
====
Ligne avec le nouveau code
>>>>

INTERDIT :
- AUCUNE introduction ("Voici le code...", "Bien sûr...", etc.)
- AUCUNE explication
- AUCUN outil interne (write_file, etc.) - JUSTE DU TEXTE
- AUCUNE écriture dans MEMORY/

Pour vérifier ton code, tu peux ajouter à la fin :
### RUN: nom_de_la_commande

DEMANDE UTILISATEUR :
${prompt}
`;

    if (errorMessage) {
        fullPrompt += `
⚠️ LA PRÉCÉDENTE EXPÉRIMENTATION A ÉCHOUÉ AVEC L'ERREUR SUIVANTE :
${errorMessage}
Veuillez corriger.
`;
    }

    const cliToUse = preferredCli || defaultCli;
    const result = await executeLimiter(fullPrompt, config.agent, { defaultCli: cliToUse, defaultModel, disabledClis });
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
            const input = formatted.input;

            const result = await execa(agentConfig.cmd, fullArgs, {
                stdin: input ? 'pipe' : 'ignore',
                input: input,
                stdout: 'pipe',
                stderr: 'pipe',
                timeout: 90000, // 90s pour laisser le temps
                shell: process.platform === 'win32',
                windowsHide: true,
                reject: false,
                stripFinalNewline: true
            });

            if (result.failed || result.exitCode !== 0 || !result.stdout.trim()) {
                console.warn(`[Agent] ${agentConfig.cmd} sortie vide ou erreur. Exit: ${result.exitCode}`);
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
