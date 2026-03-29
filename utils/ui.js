import { Markup } from 'telegraf';
import { t, languageName } from './i18n.js';

const escapeMd = (str) => str ? str.toString().replace(/([_*\[\]()~`>#\+\-=|{}\.!])/g, '\\$1') : '';
const encodePathForCallback = (relativePath) => relativePath ? encodeURIComponent(relativePath) : '';
const browseAction = (relativePath) => relativePath ? `browse:${encodePathForCallback(relativePath)}` : 'browse_root';
const selectFolderAction = (relativePath) => `select_repo:${encodePathForCallback(relativePath)}`;

export function createMainMenuKeyboard(session) {
    const locale = session.locale || 'fr';

    return Markup.inlineKeyboard([
        [
            Markup.button.callback(t(locale, 'menu_projects'), 'nav:repos'),
            Markup.button.callback(t(locale, 'menu_code'), 'action:code')
        ],
        [
            Markup.button.callback(t(locale, 'menu_config'), 'nav:config')
            ,
            Markup.button.callback(t(locale, 'menu_open_ide'), 'action:open_ide')
        ],
        [
            Markup.button.callback(t(locale, 'menu_runs'), 'action:runs'),
            Markup.button.callback(t(locale, 'menu_history'), 'action:history'),
            Markup.button.callback(t(locale, 'menu_memory'), 'action:memory')
        ],
        [
            Markup.button.callback(t(locale, 'menu_sessions'), 'nav:sessions'),
            Markup.button.callback(t(locale, 'menu_settings'), 'nav:settings'),
            Markup.button.callback(t(locale, 'menu_help'), 'action:help')
        ]
    ]);
}

export async function createRepoKeyboard(browserState, page = 0, locale = 'fr') {
    const pageSize = 6;
    const start = page * pageSize;
    const currentEntries = browserState.entries.slice(start, start + pageSize);
    const buttons = currentEntries.map(entry => [
        Markup.button.callback(`${t(locale, 'menu_projects')}: ${entry.name}`, browseAction(entry.relativePath))
    ]);

    const navButtons = [];
    if (page > 0) navButtons.push(Markup.button.callback(t(locale, 'pager_prev'), `page:${page - 1}`));
    if (browserState.parentPath !== null) {
        navButtons.push(Markup.button.callback(t(locale, 'folder_parent'), browseAction(browserState.parentPath)));
    }
    if (browserState.currentPath) {
        navButtons.push(Markup.button.callback(t(locale, 'folder_choose_current'), selectFolderAction(browserState.currentPath)));
    }
    if (start + pageSize < browserState.entries.length) navButtons.push(Markup.button.callback(t(locale, 'pager_next'), `page:${page + 1}`));
    if (navButtons.length > 0) buttons.push(navButtons);

    buttons.push([Markup.button.callback(t(locale, 'menu_new'), 'new_repo')]);
    buttons.push([Markup.button.callback(t(locale, 'menu_back'), 'nav:main')]);

    return Markup.inlineKeyboard(buttons);
}

export function createConfigKeyboard(session, availableClis) {
    const locale = session.locale || 'fr';
    const buttons = availableClis.map(cli => {
        const isDisabled = session.disabledClis.includes(cli);
        const isDefault = session.defaultCli === cli;
        const statusIcon = isDisabled ? 'OFF' : 'ON';
        return [
            Markup.button.callback(`${statusIcon} ${cli}`, `toggle_cli:${cli}`),
            Markup.button.callback(isDefault ? 'Default' : 'Set', `set_cli:${cli}`)
        ];
    });

    buttons.push([
        Markup.button.callback(t(locale, 'menu_reset_auto'), 'set_cli:auto'),
        Markup.button.callback(t(locale, 'menu_refresh'), 'refresh_clis')
    ]);
    buttons.push([Markup.button.callback(t(locale, 'menu_back'), 'nav:main')]);

    return Markup.inlineKeyboard(buttons);
}

export function createModelKeyboard(session, availableModels) {
    const locale = session.locale || 'fr';
    const currentCli = session.defaultCli || 'auto';
    let cliToShow = currentCli;

    if (cliToShow === 'auto' || !cliToShow) {
        cliToShow = Object.keys(availableModels)[0] || 'gemini';
    }

    const models = availableModels[cliToShow] || [];
    const buttons = models.map(model => {
        const isDefault = session.defaultModel === model;
        return [Markup.button.callback(`${isDefault ? 'Default' : 'Set'} ${model}`, `set_model:${model}`)];
    });

    buttons.push([Markup.button.callback(t(locale, 'menu_reset_auto'), 'set_model:auto')]);
    buttons.push([Markup.button.callback(t(locale, 'menu_back'), 'nav:config')]);

    return Markup.inlineKeyboard(buttons);
}

export function createSettingsKeyboard(session) {
    const locale = session.locale || 'fr';
    const lang = languageName(locale, locale);

    return Markup.inlineKeyboard([
        [
            Markup.button.callback(`CLI: ${session.defaultCli || t(locale, 'status_auto')}`, 'nav:config'),
            Markup.button.callback(`Model: ${session.defaultModel || t(locale, 'status_auto')}`, 'nav:model')
        ],
        [
            Markup.button.callback(`IDE: ${session.defaultIde || t(locale, 'status_auto')}`, 'nav:ide'),
            Markup.button.callback(t(locale, 'menu_open_ide'), 'action:open_ide')
        ],
        [Markup.button.callback(`${t(locale, 'settings_session_slot')}: ${t(locale, `session_slot_${session.sessionSlot || 'main'}`)}`, 'nav:sessions')],
        [Markup.button.callback(`${t(locale, 'settings_workspace_mode')}: ${t(locale, `workspace_mode_${session.workspaceMode || 'project'}`)}`, 'nav:workspace')],
        [Markup.button.callback(`${t(locale, 'settings_task_profile')}: ${t(locale, `task_profile_${session.taskProfile || 'code'}`)}`, 'nav:profile')],
        [Markup.button.callback(`${t(locale, 'settings_fallback_policy')}: ${session.fallbackMaxAttempts || 3}x`, 'nav:fallback')],
        [Markup.button.callback(`Notes: ${session.saveNotes || '-'}`, 'action:set_notes')],
        [Markup.button.callback(t(locale, 'menu_language', { lang }), 'nav:language')],
        [Markup.button.callback(t(locale, 'menu_back'), 'nav:main')]
    ]);
}

export function createWorkspaceModeKeyboard(session) {
    const locale = session.locale || 'fr';
    const currentMode = session.workspaceMode || 'project';
    const buttons = ['project', 'worktree'].map(mode => {
        const prefix = currentMode === mode ? 'ON' : 'SET';
        return [Markup.button.callback(`${prefix} ${t(locale, `workspace_mode_${mode}`)}`, `set_workspace_mode:${mode}`)];
    });

    buttons.push([Markup.button.callback(t(locale, 'menu_back'), 'nav:settings')]);
    return Markup.inlineKeyboard(buttons);
}

export function createTaskProfileKeyboard(session) {
    const locale = session.locale || 'fr';
    const currentProfile = session.taskProfile || 'code';
    const buttons = ['code', 'plan', 'review', 'fix', 'implement', 'explore', 'verify'].map(profile => {
        const prefix = currentProfile === profile ? 'ON' : 'SET';
        return [Markup.button.callback(`${prefix} ${t(locale, `task_profile_${profile}`)}`, `set_task_profile:${profile}`)];
    });

    buttons.push([Markup.button.callback(t(locale, 'menu_back'), 'nav:settings')]);
    return Markup.inlineKeyboard(buttons);
}

export function createFallbackKeyboard(session, availableClis = [], effectiveOrder = []) {
    const locale = session.locale || 'fr';
    const currentAttempts = session.fallbackMaxAttempts || 3;
    const attemptButtons = [1, 2, 3, 4, 5].map(count =>
        Markup.button.callback(
            `${currentAttempts === count ? 'ON' : 'SET'} ${count}x`,
            `set_fallback_attempts:${count}`
        )
    );

    const cliButtons = availableClis.map(cli => {
        const position = effectiveOrder.indexOf(cli);
        const prefix = position >= 0 ? `${position + 1}` : '+';
        return [Markup.button.callback(`${prefix} ${cli}`, `fallback_prioritize:${cli}`)];
    });

    const rows = [attemptButtons];
    if (cliButtons.length) {
        rows.push(...cliButtons);
    }
    rows.push([
        Markup.button.callback(t(locale, 'menu_reset_auto'), 'fallback_reset_policy'),
        Markup.button.callback(t(locale, 'menu_back'), 'nav:settings')
    ]);

    return Markup.inlineKeyboard(rows);
}

export function createSessionSlotsKeyboard(session, slots = []) {
    const locale = session.locale || 'fr';
    const currentSlot = session.sessionSlot || 'main';
    const rows = slots.map(slot => {
        const prefix = currentSlot === slot ? 'ON' : 'OPEN';
        return [Markup.button.callback(`${prefix} ${t(locale, `session_slot_${slot}`)}`, `set_session_slot:${slot}`)];
    });

    rows.push([Markup.button.callback(t(locale, 'menu_back'), 'nav:main')]);
    return Markup.inlineKeyboard(rows);
}

export function createIdeKeyboard(session, availableIdes) {
    const locale = session.locale || 'fr';
    const buttons = availableIdes.map(ide => {
        const isDisabled = session.disabledIdes.includes(ide);
        const isDefault = session.defaultIde === ide;
        const statusIcon = isDisabled ? 'OFF' : 'ON';
        return [
            Markup.button.callback(`${statusIcon} ${ide}`, `toggle_ide:${ide}`),
            Markup.button.callback(isDefault ? 'Default' : 'Set', `set_ide:${ide}`)
        ];
    });

    buttons.push([
        Markup.button.callback(t(locale, 'menu_reset_auto'), 'set_ide:auto'),
        Markup.button.callback(t(locale, 'menu_refresh'), 'refresh_ides')
    ]);
    buttons.push([Markup.button.callback(t(locale, 'menu_back'), 'nav:settings')]);

    return Markup.inlineKeyboard(buttons);
}

export function createLanguageKeyboard(session) {
    const locale = session.locale || 'fr';
    const fr = languageName('fr', locale);
    const en = languageName('en', locale);

    return Markup.inlineKeyboard([
        [Markup.button.callback(`FR ${fr}`, 'set_lang:fr')],
        [Markup.button.callback(`EN ${en}`, 'set_lang:en')],
        [Markup.button.callback(t(locale, 'menu_back'), 'nav:settings')]
    ]);
}

export function createConfirmKeyboard(confirmAction, cancelAction = 'nav:main', locale = 'fr') {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback(t(locale, 'menu_confirm'), confirmAction),
            Markup.button.callback(t(locale, 'menu_cancel'), cancelAction)
        ]
    ]);
}

export const Messages = {
    main: (session) => {
        const locale = session.locale || 'fr';
        const repoStatus = session.activeRepo ? `OK ${escapeMd(session.activeRepo)}` : t(locale, 'status_repo_none');
        const cliStatus = session.defaultCli || t(locale, 'status_auto_icon');
        const modelStatus = session.defaultModel || t(locale, 'status_auto_icon');
        const lang = languageName(locale, locale);

        return t(locale, 'main_body', {
            title: t(locale, 'app_title'),
            repo: repoStatus,
            cli: cliStatus,
            model: modelStatus,
            lang
        });
    },

    repoSelected: (repoName, locale = 'fr') => t(locale, 'repo_selected', { repo: escapeMd(repoName) }),

    codeSuccess: (filesCreated, testResult, locale = 'fr') => {
        let msg = t(locale, 'run_success', { count: filesCreated.length });
        filesCreated.forEach(file => {
            msg += `\n\`${file}\``;
        });
        if (testResult && testResult.success) msg += '\n\nTests: OK';
        return msg;
    },

    codeError: (error, attempts, locale = 'fr') => `${t(locale, 'run_failed', { max: attempts })}\n\n${error}`,

    help: (locale = 'fr') => `${t(locale, 'help_title')}

${t(locale, 'help_mode_title')}
${t(locale, 'help_mode_desc')}
${t(locale, 'help_mode_example')}

${t(locale, 'help_proj_title')}
${t(locale, 'help_proj_desc')}

${t(locale, 'help_cfg_title')}
${t(locale, 'help_cfg_desc')}

${t(locale, 'help_cmd_title')}
${t(locale, 'help_cmds')}`,

    awaitingInput: (locale = 'fr') => t(locale, 'awaiting_input')
};
