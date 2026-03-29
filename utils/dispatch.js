function foldText(value = '') {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[`"'’]/g, ' ')
        .replace(/[!?.,;:()[\]{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripOuterQuotes(value = '') {
    return value.trim().replace(/^['"`]+|['"`]+$/g, '').trim();
}

function findExactChoice(candidate, choices = []) {
    const foldedCandidate = foldText(candidate);
    if (!foldedCandidate) return null;

    return choices.find(choice => foldText(choice) === foldedCandidate) || null;
}

function findMentionedChoice(text, choices = []) {
    const foldedText = foldText(text);
    if (!foldedText) return null;

    const ranked = [...choices].sort((a, b) => b.length - a.length);
    return ranked.find(choice => foldedText.includes(foldText(choice))) || null;
}

function hasAny(text, patterns) {
    return patterns.some(pattern => text.includes(pattern));
}

function matchCommand(text, commands) {
    return commands.some(command => text === command);
}

function extractRepoSelection(rawText, repos) {
    const exactRepo = findExactChoice(rawText, repos);
    if (exactRepo) return exactRepo;

    const match = rawText.match(/^(?:projet|project|repo|depot|switch to|use project|utilise(?:r)? le projet)\s+(.+)$/iu);
    if (!match) return null;

    return findExactChoice(stripOuterQuotes(match[1]), repos);
}

function extractRepoCreation(rawText) {
    const patterns = [
        /^(?:cree|creer|cree un|creer un|cree le|creer le|nouveau projet|nouveau repo|new project|new repo|create project|create repo)\s+(.+)$/iu,
        /^(?:projet|project|repo)\s+nouveau\s+(.+)$/iu
    ];

    for (const pattern of patterns) {
        const match = rawText.match(pattern);
        if (match?.[1]) {
            const repoName = stripOuterQuotes(match[1]);
            if (repoName) return repoName;
        }
    }

    return null;
}

function extractLanguage(text) {
    const wantsEnglish = hasAny(text, ['english', 'anglais']);
    const wantsFrench = hasAny(text, ['french', 'francais', 'francais']);
    const isLanguageCommand = hasAny(text, ['langue', 'language', 'lang', 'switch', 'passe', 'set']);

    if (wantsEnglish && isLanguageCommand) return 'en';
    if (wantsFrench && isLanguageCommand) return 'fr';

    if (matchCommand(text, ['english', 'anglais'])) return 'en';
    if (matchCommand(text, ['francais', 'french'])) return 'fr';

    return null;
}

function extractCli(text, availableClis) {
    const mentioned = findMentionedChoice(text, availableClis);
    if (!mentioned) return null;

    if (
        hasAny(text, ['cli ', 'utilise', 'utiliser', 'use ', 'passe sur', 'switch to', 'avec ', 'force ']) ||
        matchCommand(text, [foldText(mentioned)])
    ) {
        return mentioned;
    }

    return null;
}

function extractRerunWithCli(rawText, availableClis) {
    const cli = findMentionedChoice(rawText, availableClis);
    if (!cli) return null;

    const text = foldText(rawText);
    if (!hasAny(text, ['relance', 'relancer', 'rerun', 'retry'])) {
        return null;
    }

    if (!hasAny(text, [' avec ', ' with ', ' using ', ' via ', ' force ', ' sur '])) {
        return null;
    }

    const runIndex = extractRerunIndex(rawText);
    if (runIndex !== null) {
        return {
            type: 'rerun_run_with_cli',
            value: { index: runIndex, cli }
        };
    }

    if (text.includes('dernier run') || text.includes('last run')) {
        return {
            type: 'rerun_last_with_cli',
            value: cli
        };
    }

    return null;
}

function extractIdeMode(text, availableIdes) {
    const mentioned = findMentionedChoice(text, availableIdes);
    if (!mentioned) return null;

    if (
        hasAny(text, ['ide ', 'editor', 'editeur', 'utilise', 'utiliser', 'use ', 'passe sur', 'switch to']) ||
        matchCommand(text, [foldText(mentioned)])
    ) {
        return mentioned;
    }

    return null;
}

function extractOpenIde(text, availableIdes) {
    if (!hasAny(text, ['ouvre', 'ouvrir', 'open', 'launch', 'lance', 'lancer'])) {
        return null;
    }

    const mentioned = findMentionedChoice(text, availableIdes);
    if (mentioned) {
        return mentioned;
    }

    if (hasAny(text, [' ide', 'ide ', 'editor', 'editeur'])) {
        return 'auto';
    }

    return null;
}

function extractModel(rawText, availableModels) {
    const allModels = [...new Set(Object.values(availableModels || {}).flat().filter(Boolean))];
    if (!allModels.length) return null;

    const directMatch = findExactChoice(rawText, allModels);
    if (directMatch) return directMatch;

    const match = rawText.match(/^(?:model|modele|modele par defaut|set model)\s+(.+)$/iu);
    if (!match?.[1]) return null;

    return findExactChoice(stripOuterQuotes(match[1]), allModels);
}

function extractWorkspaceMode(text) {
    const wantsWorktree = hasAny(text, ['worktree', 'git worktree']);
    const wantsProjectFolder = hasAny(text, ['dossier projet', 'project folder', 'repo folder', 'same folder', 'main folder']);
    const isWorkspaceCommand = hasAny(text, ['workspace', 'isolation', 'session', 'mode', 'utilise', 'utiliser', 'use ', 'switch']);

    if (wantsWorktree && (isWorkspaceCommand || matchCommand(text, ['worktree', 'git worktree']))) {
        return 'worktree';
    }

    if (wantsProjectFolder && isWorkspaceCommand) {
        return 'project';
    }

    return null;
}

function extractTaskProfile(text) {
    const isProfileCommand = hasAny(text, ['profil', 'profile', 'mode', 'utilise', 'utiliser', 'use ', 'switch']);
    const candidates = ['review', 'fix', 'explore', 'code'];
    const match = candidates.find(candidate => text.includes(candidate));

    if (!match) return null;
    if (!isProfileCommand && !matchCommand(text, candidates)) {
        return null;
    }

    return match;
}

function wantsRerunLast(text) {
    return matchCommand(text, [
        'rerun',
        'relance',
        'relancer',
        'relance dernier run',
        'relancer dernier run',
        'rerun last run',
        'retry last run'
    ]);
}

function wantsRunDetail(text) {
    return matchCommand(text, [
        'detail run',
        'details run',
        'dernier run detail',
        'detail dernier run',
        'run detail',
        'last run detail'
    ]);
}

function extractRunDetailIndex(rawText) {
    const match = rawText.match(/(?:detail|details)\s+(?:du\s+)?(?:run|dernier run|last run)\s+(\d+)/iu);
    if (!match?.[1]) return null;

    const parsed = Number.parseInt(match[1], 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return null;
    }

    return parsed - 1;
}

function extractRerunIndex(rawText) {
    const match = rawText.match(/(?:relance|relancer|rerun|retry)\s+(?:le\s+)?run\s+(\d+)/iu);
    if (!match?.[1]) return null;

    const parsed = Number.parseInt(match[1], 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return null;
    }

    return parsed - 1;
}

function extractOpenRunIdeIndex(rawText) {
    const match = rawText.match(/(?:ouvre|ouvrir|open|launch|lance|lancer)\s+(?:l\s*)?(?:ide|editor)\s+(?:du\s+)?run\s+(\d+)/iu);
    if (!match?.[1]) return null;

    const parsed = Number.parseInt(match[1], 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return null;
    }

    return parsed - 1;
}

function wantsRefreshClis(text) {
    return hasAny(text, ['refresh cli', 'rafraichis cli', 'rafraichir cli', 'scan cli', 'rescan cli']);
}

function wantsRefreshIdes(text) {
    return hasAny(text, ['refresh ide', 'rafraichis ide', 'rafraichir ide', 'scan ide', 'rescan ide']);
}

export function resolveRemoteDispatch(rawText, {
    repos = [],
    availableClis = [],
    availableIdes = [],
    availableModels = {}
} = {}) {
    const raw = (rawText || '').trim();
    const text = foldText(raw);

    if (!text) return null;

    const createdRepo = extractRepoCreation(raw);
    if (createdRepo) {
        return { type: 'create_repo', value: createdRepo };
    }

    const selectedRepo = extractRepoSelection(raw, repos);
    if (selectedRepo) {
        return { type: 'select_repo', value: selectedRepo };
    }

    const nextLanguage = extractLanguage(text);
    if (nextLanguage) {
        return { type: 'set_lang', value: nextLanguage };
    }

    const openRunIdeIndex = extractOpenRunIdeIndex(raw);
    if (openRunIdeIndex !== null) {
        return { type: 'open_run_ide', value: openRunIdeIndex };
    }

    const ideToOpen = extractOpenIde(text, availableIdes);
    if (ideToOpen) {
        return { type: 'open_ide', value: ideToOpen };
    }

    const rerunWithCli = extractRerunWithCli(raw, availableClis);
    if (rerunWithCli) {
        return rerunWithCli;
    }

    const selectedCli = extractCli(text, availableClis);
    if (selectedCli) {
        return { type: 'set_cli', value: selectedCli };
    }

    const selectedIde = extractIdeMode(text, availableIdes);
    if (selectedIde) {
        return { type: 'set_ide', value: selectedIde };
    }

    const selectedModel = extractModel(raw, availableModels);
    if (selectedModel) {
        return { type: 'set_model', value: selectedModel };
    }

    const selectedWorkspaceMode = extractWorkspaceMode(text);
    if (selectedWorkspaceMode) {
        return { type: 'set_workspace_mode', value: selectedWorkspaceMode };
    }

    const selectedTaskProfile = extractTaskProfile(text);
    if (selectedTaskProfile) {
        return { type: 'set_task_profile', value: selectedTaskProfile };
    }

    if (wantsRefreshClis(text)) {
        return { type: 'refresh_clis' };
    }

    if (wantsRefreshIdes(text)) {
        return { type: 'refresh_ides' };
    }

    if (matchCommand(text, ['menu', 'main menu', 'accueil', 'home'])) {
        return { type: 'show_main_menu' };
    }

    if (matchCommand(text, ['code', 'coder', 'start coding', 'code mode'])) {
        return { type: 'show_code_prompt' };
    }

    if (
        matchCommand(text, ['projets', 'projects', 'liste projets', 'list projects', 'change project', 'choisir projet', 'select project']) ||
        text.startsWith('liste des projets')
    ) {
        return { type: 'show_projects' };
    }

    if (matchCommand(text, ['config', 'configuration', 'cli config', 'config cli'])) {
        return { type: 'show_config' };
    }

    if (matchCommand(text, ['settings', 'parametres', 'parametres session', 'session settings'])) {
        return { type: 'show_settings' };
    }

    if (matchCommand(text, ['workspace', 'workspaces', 'isolation', 'mode isolation', 'workspace mode'])) {
        return { type: 'show_workspace_menu' };
    }

    if (matchCommand(text, ['profile', 'profil', 'profiles', 'profils', 'mode review', 'mode fix', 'mode explore'])) {
        return { type: 'show_profile_menu' };
    }

    if (matchCommand(text, ['model', 'modele', 'models', 'modeles'])) {
        return { type: 'show_model_menu' };
    }

    if (matchCommand(text, ['ide', 'ides', 'editor', 'editors'])) {
        return { type: 'show_ide_menu' };
    }

    if (matchCommand(text, ['langue', 'language', 'lang'])) {
        return { type: 'show_language_menu' };
    }

    if (matchCommand(text, ['help', 'aide', 'commands', 'commandes'])) {
        return { type: 'show_help' };
    }

    if (matchCommand(text, ['memory', 'memoire', 'rag', 'context', 'contexte'])) {
        return { type: 'show_memory' };
    }

    if (
        matchCommand(text, ['history', 'historique', 'show history', 'montre historique']) ||
        text.startsWith('historique ')
    ) {
        return { type: 'show_history' };
    }

    if (matchCommand(text, ['runs', 'run', 'derniers runs', 'last runs', 'run status', 'tentatives'])) {
        return { type: 'show_runs' };
    }

    if (wantsRerunLast(text)) {
        return { type: 'rerun_last' };
    }

    const rerunIndex = extractRerunIndex(raw);
    if (rerunIndex !== null) {
        return { type: 'rerun_run', value: rerunIndex };
    }

    const runDetailIndex = extractRunDetailIndex(raw);
    if (runDetailIndex !== null) {
        return { type: 'show_run_detail', value: runDetailIndex };
    }

    if (wantsRunDetail(text)) {
        return { type: 'show_run_detail' };
    }

    if (matchCommand(text, ['save', 'sauvegarde', 'sauver', 'enregistre session'])) {
        return { type: 'manual_save' };
    }

    if (
        matchCommand(text, ['note', 'notes', 'ajoute une note', 'add note']) ||
        text.startsWith('note ')
    ) {
        return { type: 'set_notes_mode' };
    }

    return null;
}
