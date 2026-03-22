/**
 * UI Module - Inline Keyboards & Telegram Interface
 * Inspire de gemini_cli_server et GeminiCLI_Slash_Listen
 */

import { Markup } from 'telegraf';
import { t, languageName } from './i18n.js';

const escapeMd = (str) => str ? str.toString().replace(/([_*\[\]()~`>#\+\-=|{}\.!])/g, '\\$1') : '';

/**
 * Menu Principal - Tuiles d'actions rapides
 */
export function createMainMenuKeyboard(session) {
    const locale = session.locale || 'fr';

    return Markup.inlineKeyboard([
        [Markup.button.callback(t(locale, 'menu_projects'), 'nav:repos')],
        [
            Markup.button.callback(t(locale, 'menu_code'), 'action:code'),
            Markup.button.callback(t(locale, 'menu_config'), 'nav:config')
        ],
        [
            Markup.button.callback(t(locale, 'menu_history'), 'action:history'),
            Markup.button.callback(t(locale, 'menu_settings'), 'nav:settings')
        ],
        [Markup.button.callback(t(locale, 'menu_help'), 'action:help')]
    ]);
}

/**
 * Menu de Navigation Repo
 */
export async function createRepoKeyboard(repos, page = 0, locale = 'fr') {
    const pageSize = 6;
    const start = page * pageSize;
    const currentRepos = repos.slice(start, start + pageSize);

    const buttons = currentRepos.map(repo => [Markup.button.callback(`📁 ${repo}`, `select_repo:${repo}`)]);

    const navButtons = [];
    if (page > 0) navButtons.push(Markup.button.callback('⬅️', `page:${page - 1}`));
    navButtons.push(Markup.button.callback(t(locale, 'menu_new'), 'new_repo'));
    if (start + pageSize < repos.length) navButtons.push(Markup.button.callback('➡️', `page:${page + 1}`));
    buttons.push(navButtons);

    buttons.push([Markup.button.callback(t(locale, 'menu_back'), 'nav:main')]);

    return Markup.inlineKeyboard(buttons);
}

/**
 * Menu de Configuration CLI
 */
export function createConfigKeyboard(session, availableClis) {
    const locale = session.locale || 'fr';
    const buttons = availableClis.map(cli => {
        const isDisabled = session.disabledClis.includes(cli);
        const isDefault = session.defaultCli === cli;
        const statusIcon = isDisabled ? '🔴' : '🟢';
        return [
            Markup.button.callback(`${statusIcon} ${cli}`, `toggle_cli:${cli}`),
            Markup.button.callback(isDefault ? '⭐' : '🔸', `set_cli:${cli}`)
        ];
    });

    buttons.push([
        Markup.button.callback(t(locale, 'menu_reset_auto'), 'set_cli:auto'),
        Markup.button.callback(t(locale, 'menu_refresh'), 'refresh_clis')
    ]);
    buttons.push([Markup.button.callback(t(locale, 'menu_back'), 'nav:main')]);

    return Markup.inlineKeyboard(buttons);
}

/**
 * Menu de Configuration Model
 */
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
        return [Markup.button.callback(`${isDefault ? '⭐' : '🔹'} ${model}`, `set_model:${model}`)];
    });

    buttons.push([Markup.button.callback(t(locale, 'menu_reset_auto'), 'set_model:auto')]);
    buttons.push([Markup.button.callback(t(locale, 'menu_back'), 'nav:config')]);

    return Markup.inlineKeyboard(buttons);
}

/**
 * Menu Settings
 */
export function createSettingsKeyboard(session) {
    const locale = session.locale || 'fr';
    const lang = languageName(locale, locale);

    return Markup.inlineKeyboard([
        [
            Markup.button.callback('🎯 CLI: ' + (session.defaultCli || t(locale, 'status_auto')), 'nav:config'),
            Markup.button.callback('🤖 Model: ' + (session.defaultModel || t(locale, 'status_auto')), 'nav:model')
        ],
        [
            Markup.button.callback('💻 IDE: ' + (session.defaultIde || t(locale, 'status_auto')), 'nav:ide'),
            Markup.button.callback(t(locale, 'menu_open_ide'), 'action:open_ide')
        ],
        [Markup.button.callback('📝 Notes: ' + (session.saveNotes || '-'), 'action:set_notes')],
        [Markup.button.callback(t(locale, 'menu_language', { lang }), 'nav:language')],
        [Markup.button.callback(t(locale, 'menu_back'), 'nav:main')]
    ]);
}

/**
 * Menu de Configuration IDE
 */
export function createIdeKeyboard(session, availableIdes) {
    const locale = session.locale || 'fr';
    const buttons = availableIdes.map(ide => {
        const isDisabled = session.disabledIdes.includes(ide);
        const isDefault = session.defaultIde === ide;
        const statusIcon = isDisabled ? '🔴' : '🟢';
        return [
            Markup.button.callback(`${statusIcon} ${ide}`, `toggle_ide:${ide}`),
            Markup.button.callback(isDefault ? '⭐' : '🔸', `set_ide:${ide}`)
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
        [Markup.button.callback(`🇫🇷 ${fr}`, 'set_lang:fr')],
        [Markup.button.callback(`🇬🇧 ${en}`, 'set_lang:en')],
        [Markup.button.callback(t(locale, 'menu_back'), 'nav:settings')]
    ]);
}

/**
 * Keyboard de confirmation
 */
export function createConfirmKeyboard(confirmAction, cancelAction = 'nav:main', locale = 'fr') {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback(t(locale, 'menu_confirm'), confirmAction),
            Markup.button.callback(t(locale, 'menu_cancel'), cancelAction)
        ]
    ]);
}

/**
 * Messages formates
 */
export const Messages = {
    main: (session) => {
        const locale = session.locale || 'fr';
        const repoStatus = session.activeRepo ? `✅ ${escapeMd(session.activeRepo)}` : t(locale, 'status_repo_none');
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
        filesCreated.forEach(f => { msg += `\n   \`${f}\``; });
        if (testResult && testResult.success) msg += '\n\n✅ Tests: OK';
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

