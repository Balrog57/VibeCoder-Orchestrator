import { execa } from 'execa';

/**
 * Détection dynamique des CLI installés et de leurs modèles disponibles
 * 
 * Pour chaque CLI, on exécute une commande pour vérifier :
 * 1. Si le CLI est installé (commande --version ou help)
 * 2. Quels modèles sont disponibles (commande models ou équivalent)
 */

const CLI_CONFIG = {
    claude: {
        checkCmd: ['--version'],
        modelsCmd: null,
        knownModels: ['sonnet', 'opus', 'haiku', 'claude-sonnet-4-6', 'claude-opus-4-1'],
        tier: 'premium',
        description: 'Meilleur en planification (payant)'
    },
    gemini: {
        checkCmd: ['--version'],
        modelsCmd: null,
        knownModels: ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-2.5-flash'],
        tier: 'freemium',
        description: 'Meilleur en réflexion/UI (free tier)'
    },
    codex: {
        checkCmd: ['--version'],
        modelsCmd: null,
        knownModels: ['o3', 'o4-mini', 'gpt-4.1', 'gpt-4.1-nano', 'gpt-4.1-mini'],
        tier: 'premium',
        description: 'Rapide pour tâches courtes (payant)'
    },
    qwen: {
        checkCmd: ['--version'],
        modelsCmd: null,
        knownModels: ['qwen3.5', 'qwen3', 'qwen2.5-coder', 'qwen2.5-72b'],
        tier: 'freemium',
        description: 'Équilibré (gratuit + payant)'
    },
    opencode: {
        checkCmd: ['--version'],
        modelsCmd: ['models'],
        knownModels: [],
        tier: 'free',
        description: 'Dernier recours gratuit'
    }
};

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
    
    // Si pas de commande models, retourne les modèles connus
    if (!config.modelsCmd) {
        return config.knownModels;
    }
    
    // Essaye de récupérer les modèles dynamiquement
    try {
        const result = await execa(cliName, config.modelsCmd, {
            timeout: 10000,
            shell: process.platform === 'win32',
            reject: false
        });
        
        if (result.exitCode === 0 && result.stdout.trim()) {
            // Parser la sortie pour extraire les modèles
            const models = parseModelsFromOutput(result.stdout, cliName);
            if (models.length > 0) return models;
        }
    } catch (err) {
        // Fallback aux modèles connus
    }
    
    return config.knownModels;
}

/**
 * Parse la sortie d'une commande models pour extraire les noms de modèles
 */
function parseModelsFromOutput(output, cliName) {
    const models = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
        // Patterns communs pour les modèles
        const patterns = [
            /([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)/,  // provider/model
            /\b([a-z]+-[a-z0-9.-]+)\b/,             // model-name-format
        ];
        
        for (const pattern of patterns) {
            const match = line.match(pattern);
            if (match && !line.includes('http') && !line.includes('Usage')) {
                let modelName = match[1];
                // Nettoyer le nom
                modelName = modelName.replace(/^[^\/]+\//, ''); // Enlever le provider
                if (modelName.length > 2 && modelName.length < 50) {
                    models.push(modelName);
                }
            }
        }
    }
    
    return [...new Set(models)]; // Dedup
}

/**
 * Scanne tous les CLI et retourne ceux qui sont disponibles
 */
export async function scanAvailableClis() {
    const available = [];
    
    for (const [cliName, config] of Object.entries(CLI_CONFIG)) {
        const isAvailable = await checkCliAvailable(cliName);
        if (isAvailable) {
            const models = await getAvailableModels(cliName);
            available.push({
                name: cliName,
                models: models,
                tier: config.tier,
                description: config.description
            });
            console.log(`[CLI] ${cliName} disponible (${config.tier}) - ${models.length} modèles`);
        } else {
            console.log(`[CLI] ${cliName} non installé`);
        }
    }
    
    // Trier par tier: free > freemium > premium (pour favoriser le gratuit)
    const tierPriority = { free: 1, freemium: 2, premium: 3 };
    available.sort((a, b) => tierPriority[a.tier] - tierPriority[b.tier]);
    
    return available;
}

/**
 * Retourne la configuration complète des CLI et modèles
 */
export async function getCliConfig() {
    const availableClis = await scanAvailableClis();
    
    return {
        availableClis: availableClis.map(c => c.name),
        modelsByCli: Object.fromEntries(availableClis.map(c => [c.name, c.models])),
        tiersByCli: Object.fromEntries(availableClis.map(c => [c.name, c.tier]))
    };
}

/**
 * Met à jour la configuration des agents avec l'ordre de fallback dynamique
 */
export async function buildAgentConfig() {
    const { availableClis, modelsByCli } = await getCliConfig();
    
    // Ordre de fallback : claude > gemini > codex > qwen > opencode
    const fallbackOrder = ['claude', 'gemini', 'codex', 'qwen', 'opencode'];
    const orderedClis = fallbackOrder.filter(cli => availableClis.includes(cli));
    
    if (orderedClis.length === 0) {
        console.warn('[AgentConfig] Aucun CLI disponible!');
        return { architect: [], developer: [], techlead: [] };
    }
    
    // Construire la config pour chaque rôle
    const buildRoleConfig = (preferredCli = null) => {
        const clis = preferredCli 
            ? [preferredCli, ...orderedClis.filter(c => c !== preferredCli)]
            : orderedClis;
        
        return clis.map(cli => {
            const args = getArgsForCli(cli);
            return { cmd: cli, args, promptAfterArgs: true };
        });
    };
    
    return {
        architect: buildRoleConfig('claude'),
        developer: buildRoleConfig('gemini'),
        techlead: buildRoleConfig('claude')
    };
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
