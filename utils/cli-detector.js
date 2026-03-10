import { execa } from 'execa';

/**
 * CONFIGURATION ET DÉTECTION DYNAMIQUE DES CLI
 * 
 * Source unique de vérité pour les arguments, les tiers et les modèles.
 */

const CLI_CONFIG = {
    claude: {
        checkCmd: ['--version'],
        modelsCmd: null,
        knownModels: ['sonnet', 'opus', 'haiku', 'claude-sonnet-4-6', 'claude-opus-4-1'],
        tier: 'premium',
        inputMode: 'args',  // Arguments en ligne de commande
        promptFlag: '-p',
        modelFlag: '-m',
        description: 'Meilleur en planification (payant)'
    },
    gemini: {
        checkCmd: ['--version'],
        modelsCmd: null,
        knownModels: ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-2.5-flash'],
        tier: 'freemium',
        inputMode: 'stdin',  // Prompt via stdin pour éviter les conflits
        promptFlag: '--prompt',
        modelFlag: '-m',
        description: 'Meilleur en réflexion/UI (free tier)'
    },
    codex: {
        checkCmd: ['--version'],
        modelsCmd: null,
        knownModels: ['o3', 'o4-mini', 'gpt-4.1', 'gpt-4.1-nano', 'gpt-4.1-mini'],
        tier: 'premium',
        inputMode: 'args',
        promptFlag: 'exec',
        modelFlag: '-m',
        description: 'Rapide pour tâches courtes (payant)'
    },
    qwen: {
        checkCmd: ['--version'],
        modelsCmd: null,
        knownModels: ['qwen3.5', 'qwen3', 'qwen2.5-coder', 'qwen2.5-72b'],
        tier: 'freemium',
        inputMode: 'stdin',  // Prompt via stdin pour éviter les conflits
        promptFlag: '-p',
        modelFlag: '-m',
        description: 'Équilibré (gratuit + payant)'
    },
    opencode: {
        checkCmd: ['--version'],
        modelsCmd: ['models'],
        knownModels: [],
        tier: 'free',
        inputMode: 'args',
        promptFlag: 'run',
        modelFlag: '-m',
        description: 'Dernier recours gratuit'
    }
};

/**
 * Construit proprement la liste des arguments pour un CLI
 * Retourne { args, input } où input est le prompt pour stdin si nécessaire
 */
export function getFormattedArgs(cliName, model, prompt) {
    const config = CLI_CONFIG[cliName];
    if (!config) return { args: ['-p', prompt], input: undefined };

    const args = [];
    let input = undefined;

    // 1. Gestion spécifique par type de CLI
    if (cliName === 'codex') {
        // Usage: codex exec [OPTIONS] [PROMPT]
        args.push('exec');
        if (model) args.push('-m', model);
        args.push(prompt);
    } else if (cliName === 'opencode') {
        // Usage: opencode run [PROMPT]
        args.push('run');
        if (model) args.push('-m', model);
        args.push(prompt);
    } else if (config.inputMode === 'stdin') {
        // Gemini, Qwen: prompt via stdin pour éviter les conflits
        if (config.extraArgs) args.push(...config.extraArgs);
        if (model) args.push(config.modelFlag, model);
        input = prompt;  // Le prompt sera passé via stdin
    } else {
        // Claude: Flag + Prompt + Modèle
        if (config.extraArgs) args.push(...config.extraArgs);
        args.push(config.promptFlag, prompt);
        if (model) args.push(config.modelFlag, model);
    }

    return { args, input };
}

/**
 * Vérifie si un CLI est installé et disponible
 */
export async function checkCliAvailable(cliName) {
    try {
        const config = CLI_CONFIG[cliName];
        if (!config) return false;

        const result = await execa(cliName, config.checkCmd, {
            timeout: 5000,
            shell: process.platform === 'win32',
            reject: false
        });

        return result.exitCode === 0;
    } catch (err) {
        return false;
    }
}

/**
 * Récupère la liste des modèles disponibles pour un CLI
 */
export async function getAvailableModels(cliName) {
    const config = CLI_CONFIG[cliName];
    if (!config) return [];

    if (!config.modelsCmd) return config.knownModels;

    try {
        const result = await execa(cliName, config.modelsCmd, {
            timeout: 10000,
            shell: process.platform === 'win32',
            reject: false
        });

        if (result.exitCode === 0 && result.stdout.trim()) {
            const models = parseModelsFromOutput(result.stdout, cliName);
            if (models.length > 0) return models;
        }
    } catch (err) { }

    return config.knownModels;
}

function parseModelsFromOutput(output, cliName) {
    const models = [];
    const lines = output.split('\n');
    for (const line of lines) {
        const patterns = [/([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)/, /\b([a-z]+-[a-z0-9.-]+)\b/];
        for (const pattern of patterns) {
            const match = line.match(pattern);
            if (match && !line.includes('http') && !line.includes('Usage')) {
                let modelName = match[1].replace(/^[^\/]+\//, '');
                if (modelName.length > 2 && modelName.length < 50) models.push(modelName);
            }
        }
    }
    return [...new Set(models)];
}

/**
 * Scanne tous les CLI et retourne ceux qui sont disponibles
 */
export async function scanAvailableClis() {
    const available = [];
    for (const [cliName, config] of Object.entries(CLI_CONFIG)) {
        if (await checkCliAvailable(cliName)) {
            const models = await getAvailableModels(cliName);
            available.push({
                name: cliName,
                models: models,
                tier: config.tier,
                description: config.description
            });
        }
    }
    const tierPriority = { free: 1, freemium: 2, premium: 3 };
    available.sort((a, b) => tierPriority[a.tier] - tierPriority[b.tier]);
    return available;
}

/**
 * Source unique pour la configuration des agents avec fallback
 */
export async function buildAgentConfig() {
    const available = await scanAvailableClis();
    const availableNames = available.map(c => c.name);

    const priorityByRole = {
        // Claude/Gemini pour la réflexion et planification
        architect: ['claude', 'gemini', 'qwen', 'codex', 'opencode'],
        // Codex/Qwen pour le code rapide et économique
        developer: ['codex', 'qwen', 'gemini', 'claude', 'opencode'],
        // Qwen en premier pour le formatage (Gemini YOLO pose des problèmes)
        techlead: ['qwen', 'claude', 'gemini', 'codex', 'opencode']
    };

    const buildRoleConfig = (role) => {
        return priorityByRole[role]
            .filter(name => availableNames.includes(name))
            .map(name => ({
                cmd: name,
                tier: CLI_CONFIG[name].tier
            }));
    };

    return {
        architect: buildRoleConfig('architect'),
        developer: buildRoleConfig('developer'),
        techlead: buildRoleConfig('techlead')
    };
}
