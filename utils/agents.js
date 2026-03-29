import { buildAgentConfig } from './cli-detector.js';
import { getCliAdapter } from './cli-adapters.js';
import { buildTaskProfilePrompt, normalizeTaskProfile } from './task-profiles.js';
import {
    assessExecutionResult,
    buildCliExecutionPlan,
    classifyFailureReason,
    createExceptionTrace,
    createFailureTrace,
    createSuccessTrace
} from './fallback-policy.js';

/**
 * PIPELINE SIMPLE (MODE TELECOMMANDE)
 *
 * Un seul agent recoit le prompt, l'execute avec le contexte memoire,
 * puis renvoie une sortie formatee exploitable par le systeme.
 * La logique de fallback reste en place, mais passe maintenant
 * par une couche d'adapters CLI et une policy dediee.
 */

let GLOBAL_CONFIG = null;

export { classifyFailureReason };

export function shouldTriggerFallback(result) {
    return assessExecutionResult(result);
}

async function ensureConfig() {
    if (!GLOBAL_CONFIG) {
        GLOBAL_CONFIG = await buildAgentConfig();
    }
    return GLOBAL_CONFIG;
}

export async function runVibeAgent(prompt, context, errorMessage = null, options = {}) {
    const config = await ensureConfig();
    const {
        defaultCli,
        defaultModel,
        preferredCli,
        disabledClis = [],
        preferredOrder = [],
        strictCli = false,
        cwd = process.cwd(),
        taskProfile = 'code'
    } = options;

    const fullPrompt = buildRemotePrompt({
        prompt,
        context,
        errorMessage,
        taskProfile
    });

    const cliToUse = preferredCli || defaultCli;
    const result = await executeLimiter(fullPrompt, config.agent, {
        defaultCli: cliToUse,
        defaultModel,
        disabledClis,
        preferredOrder,
        strictCli,
        cwd
    });
    return { output: result.output, usedCli: result.usedCli, traces: result.traces || [] };
}

export function buildRemotePrompt({
    prompt,
    context,
    errorMessage = null,
    taskProfile = 'code'
}) {
    const normalizedProfile = normalizeTaskProfile(taskProfile);

    let fullPrompt = `Tu es une IA Developpeur Full-Stack Senior et autonome.
Ton role est d'accomplir la tache demandee et de retourner UNIQUEMENT la reponse formatee.

CONTEXTE MEMOIRE (QMD) :
${context}

${buildTaskProfilePrompt(normalizedProfile)}

REGLES ABSOLUES DE FORMATAGE :
SI TU DOIS MODIFIER OU CREER DES FICHIERS, TU DOIS OBLIGATOIREMENT UTILISER L'UN DES DEUX FORMATS CI-DESSOUS.
TA REPONSE DOIT COMMENCER DIRECTEMENT PAR "### FILE:" OU "### PATCH:" SANS AUCUN TEXTE AVANT.

1. Pour CREER ou REECRIRE TOTALEMENT un fichier :
### FILE: src/chemin/vers/fichier.ext
\`\`\`langage
// Code complet ici
\`\`\`

2. Pour MODIFIER UN FICHIER EXISTANT (Patching intelligent) :
### PATCH: src/chemin/vers/fichier.ext
<<<<
Ligne exacte du code original a remplacer (Garde l'indentation identique)
====
Ligne avec le nouveau code
>>>>

INTERDIT :
- AUCUNE introduction ("Voici le code...", "Bien sur...", etc.)
- AUCUNE explication
- AUCUN outil interne (write_file, etc.) - JUSTE DU TEXTE
- AUCUNE ecriture dans MEMORY/

Pour verifier ton code, tu peux ajouter a la fin :
### RUN: nom_de_la_commande

DEMANDE UTILISATEUR :
${prompt}
`;

    if (errorMessage) {
        fullPrompt += `
La precedente experimentation a echoue avec l'erreur suivante :
${errorMessage}
Veuillez corriger.
`;
    }

    return fullPrompt;
}

/**
 * Execute l'appel CLI avec fallback.
 */
async function executeLimiter(prompt, configList, options = {}) {
    const {
        defaultCli = null,
        defaultModel = null,
        disabledClis = [],
        preferredOrder = [],
        strictCli = false,
        cwd = process.cwd()
    } = options;
    let lastError = null;
    const traces = [];

    const agentsToTry = buildCliExecutionPlan(configList, { defaultCli, disabledClis, preferredOrder, strictCli });

    if (agentsToTry.length === 0) {
        throw new Error('Aucun CLI disponible (tous desactives).');
    }

    for (const agentConfig of agentsToTry) {
        const start = Date.now();
        let traceRecorded = false;

        try {
            console.log(`[Agent] Tentative avec ${agentConfig.cmd}...`);

            const adapter = getCliAdapter(agentConfig.cmd);
            if (!adapter) {
                const missingCliError = new Error(`Adapter introuvable pour ${agentConfig.cmd}`);
                const missingTrace = createExceptionTrace(agentConfig.cmd, missingCliError, Date.now() - start);
                missingTrace.reason = 'cli_unavailable';
                traces.push(missingTrace);
                traceRecorded = true;
                throw missingCliError;
            }

            const { result, failure } = await adapter.execute({
                cwd,
                prompt,
                model: defaultModel,
                timeoutMs: 120000
            });

            if (failure.failed) {
                const errorDetail = failure.detail;
                console.warn(`[Agent] ${agentConfig.cmd} echec. Exit: ${result.exitCode}. Signal: ${result.signal}`);
                if (result.timedOut) {
                    console.warn(`[Agent] ${agentConfig.cmd} a expire (timeout).`);
                }

                traces.push(createFailureTrace(agentConfig.cmd, failure, result, Date.now() - start));
                traceRecorded = true;
                throw new Error(`${agentConfig.cmd}: ${errorDetail.slice(0, 200)} (Exit: ${result.exitCode})`);
            }

            console.log(`[Agent] ${agentConfig.cmd} reussi. Output length: ${result.stdout.length}`);
            traces.push(createSuccessTrace(agentConfig.cmd, result, Date.now() - start));
            traceRecorded = true;

            return {
                output: result.stdout,
                usedCli: agentConfig.cmd,
                traces
            };
        } catch (error) {
            console.warn(`[Agent] Echec de ${agentConfig.cmd}: ${error.message}`);
            if (!traceRecorded) {
                traces.push(createExceptionTrace(agentConfig.cmd, error, Date.now() - start));
            }
            lastError = error;
        }
    }

    const globalError = new Error(`Echec global. Dernier message: ${lastError?.message}`);
    globalError.traces = traces;
    throw globalError;
}

export { buildAgentConfig };
