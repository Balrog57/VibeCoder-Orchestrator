export const TASK_PROFILES = Object.freeze({
    code: {
        id: 'code',
        preferredCli: null,
        preferredModel: null,
        promptLabel: 'Execution code',
        instruction: [
            'Objectif principal: produire un resultat executable avec un minimum d aller-retour.',
            'Priorise la creation ou modification de fichiers valides et testables.',
            'Si plusieurs options sont possibles, choisis la plus directe et la plus maintenable.'
        ].join('\n')
    },
    review: {
        id: 'review',
        preferredCli: 'claude',
        preferredModel: null,
        promptLabel: 'Revue',
        instruction: [
            'Objectif principal: analyser le code demande comme une revue technique.',
            'Priorise les bugs, regressions, risques de comportement et tests manquants.',
            'Si des fichiers doivent etre modifies, corrige seulement ce qui est necessaire et garde le scope serre.'
        ].join('\n')
    },
    fix: {
        id: 'fix',
        preferredCli: 'codex',
        preferredModel: null,
        promptLabel: 'Correction',
        instruction: [
            'Objectif principal: corriger rapidement une erreur, un test ou une regression.',
            'Concentre-toi sur la cause la plus probable puis livre le plus petit correctif fiable.',
            'Evite les refontes larges tant qu elles ne sont pas indispensables pour stabiliser le systeme.'
        ].join('\n')
    },
    explore: {
        id: 'explore',
        preferredCli: 'gemini',
        preferredModel: null,
        promptLabel: 'Exploration',
        instruction: [
            'Objectif principal: explorer le codebase, comprendre la structure et proposer une direction claire.',
            'Privilegie l analyse, les hypotheses explicites et les changements limits si une ecriture est necessaire.',
            'Si la demande est ambigue, avance avec des assumptions raisonnables et rends-les visibles dans la reponse.'
        ].join('\n')
    }
});

export function normalizeTaskProfile(profileId) {
    return TASK_PROFILES[profileId] ? profileId : 'code';
}

export function getTaskProfile(profileId) {
    const normalized = normalizeTaskProfile(profileId);
    return TASK_PROFILES[normalized];
}

export function listTaskProfiles() {
    return Object.values(TASK_PROFILES);
}

export function buildTaskProfilePrompt(profileId) {
    const profile = getTaskProfile(profileId);
    return `PROFIL ACTIF: ${profile.promptLabel}\n${profile.instruction}`;
}
