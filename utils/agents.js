import { execa } from 'execa';

// Appel à l'Agent Architecte (Planification)
export async function runArchitectAgent(prompt, context) {
    const fullPrompt = `Tu es un Architecte Logiciel.
Ton rôle est d'analyser la demande de l'utilisateur et le contexte existant, puis de générer un plan d'action d'implémentation clair.
NE GÉNÈRE PAS DE CODE. Fournis uniquement les étapes nécessaires.

CONTEXTE MÉMOIRE (QMD) :
${context}

DEMANDE UTILISATEUR :
${prompt}`;

    return await executeLimiter(fullPrompt, 'gemini-cli', 'codex-cli');
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

    return await executeLimiter(fullPrompt, 'gemini-cli', 'codex-cli');
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

    return await executeLimiter(fullPrompt, 'gemini-cli', 'codex-cli');
}

// Fonction utilitaire pour exécuter l'appel CLI avec fallback
async function executeLimiter(prompt, primaryCli, fallbackCli) {
    try {
        console.log(`[Agent] Exécution via ${primaryCli}...`);
        // On passe les arguments sous forme de tableau pour execa
        const { stdout } = await execa(primaryCli, ['--prompt', prompt]);
        return stdout;
    } catch (error) {
        console.warn(`[Agent] Échec de ${primaryCli}: ${error.message}. Tentative de fallback sur ${fallbackCli}...`);
        try {
            const { stdout } = await execa(fallbackCli, ['run', prompt]);
            return stdout;
        } catch (fallbackError) {
            console.error(`[Agent] Échec critique du fallback ${fallbackCli}:`, fallbackError);
            throw new Error(`Échec de génération. Primary et Fallback ont tous les deux planté.`);
        }
    }
}
