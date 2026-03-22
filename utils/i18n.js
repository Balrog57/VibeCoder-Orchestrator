const FALLBACK_LOCALES = ['en', 'fr'];

const DICTIONARY = {
    fr: {
        app_title: 'VibeRemote',
        menu_projects: '📁 Projets',
        menu_code: '💬 Coder',
        menu_config: '🔧 Config',
        menu_history: '📊 Historique',
        menu_settings: '⚙️ Settings',
        menu_help: '❓ Aide',
        menu_back: '🔙 Retour',
        menu_new: '➕ Nouveau',
        menu_reset_auto: '🔄 Reset Auto',
        menu_refresh: '🔁 Refresh',
        menu_open_ide: '🚀 Ouvrir IDE',
        menu_language: '🌐 Langue: {lang}',
        menu_confirm: '✅ Confirmer',
        menu_cancel: '❌ Annuler',
        nav_main: '🏠 Menu',
        status_repo_none: '❌ Aucun',
        status_auto: 'Auto',
        status_auto_icon: '⚡ Auto',
        settings_title: '🎛 **Settings**',
        settings_project: 'Projet',
        settings_cli: 'CLI',
        settings_ide: 'IDE',
        config_cli_title: '⚙️ **Configuration CLI**',
        config_cli_current: 'CLI actuel',
        config_model_title: '🤖 **Configuration Model**',
        config_model_current: 'Model actuel',
        config_model_cli: 'CLI',
        config_ide_title: '💻 **Configuration IDE**',
        config_ide_current: 'IDE actuel',
        config_language_title: '🌐 **Langue**',
        config_language_current: 'Langue actuelle',
        repo_select_title: '📁 **Selectionnez un projet :**',
        repo_new_prompt: '📝 **Nom du nouveau projet :**\n\n_Tapez le nom et envoyez._',
        repo_ready: '🚀 Projet **{repo}** pret.',
        repo_selected: '✅ **Projet active:** {repo}\n\n💬 Que voulez-vous coder ?',
        welcome: '👋 **Bienvenue !**',
        awaiting_input: '💬 **En attente de vos instructions...**\n\n_Decrivez ce que vous voulez coder, je m\'occupe de tout !_',
        no_project: '⚠️ Selectionnez d\'abord un projet.',
        no_history: '📭 Aucun historique pour ce projet.',
        history_title: '📊 **Historique ({repo})**',
        save_failed: '❌ Sauvegarde impossible: {error}',
        save_ok: '💾 Sauvegarde OK:\n`{path}`',
        notes_prompt: '📝 Envoyez votre note pour la prochaine sauvegarde.',
        notes_updated: '📝 Notes mises a jour: {notes}',
        ide_opened: '🚀 IDE lance: **{ide}** sur `{repo}`',
        ide_opened_short: 'IDE ouvert: {ide}',
        ide_failed: '❌ Impossible de lancer un IDE: {error}',
        help_title: '📚 **Aide VibeRemote**',
        help_mode_title: '💬 **Mode Conversationnel:**',
        help_mode_desc: 'Envoyez simplement vos instructions naturellement :',
        help_mode_example: '_"Cree un formulaire de login avec validation"_',
        help_proj_title: '📁 **Selection de Projet:**',
        help_proj_desc: 'Utilisez la tuile 📁 Projets pour choisir',
        help_cfg_title: '⚙️ **Configuration:**',
        help_cfg_desc: 'Personnalisez CLI et Model selon vos besoins',
        help_cmd_title: '🔧 **Commandes Slash:**',
        help_cmds: '/code - Selectionner un projet\n/cli - Configurer le CLI\n/model - Configurer le model\n/settings - Voir les settings\n/ide - Configurer les IDE\n/lang - Changer la langue\n/save - Sauvegarder la session\n/history - Historique',
        main_body: '🤖 **{title}**\n\n📁 **Projet:** {repo}\n⚙️ **CLI:** {cli}\n🤖 **Model:** {model}\n🌐 **Langue:** {lang}\n\n💡 _Envoyez vos instructions naturellement ou utilisez les tuiles ci-dessous._',
        status_processing: 'En cours: {repo}',
        status_analyzing: '⏳ [{repo}] Analyse...',
        status_generating: '🧠 (Essai {attempt}/{max}) Generation...',
        status_testing: '⚡ (Essai {attempt}/{max}) Tests...',
        run_success: '🎯 **Succes !**\n\n📁 **Fichiers :** {count}',
        run_failed: '❌ Echec apres {max} essais.',
        fatal_error: '💥 Erreur : {error}',
        language_set: '🌐 Langue active: {lang}',
        language_name_fr: 'Francais',
        language_name_en: 'English',
        gui_no_project: '📂 Aucun projet',
        gui_ready: 'Pret a coder !',
        gui_welcome: 'Bienvenue ! Selectionnez un projet sur Telegram ou via les tuiles ci-dessous.',
        gui_notes_prompt: '📝 Envoyez vos notes dans le champ de saisie.'
    },
    en: {
        app_title: 'VibeRemote',
        menu_projects: '📁 Projects',
        menu_code: '💬 Code',
        menu_config: '🔧 Config',
        menu_history: '📊 History',
        menu_settings: '⚙️ Settings',
        menu_help: '❓ Help',
        menu_back: '🔙 Back',
        menu_new: '➕ New',
        menu_reset_auto: '🔄 Reset Auto',
        menu_refresh: '🔁 Refresh',
        menu_open_ide: '🚀 Open IDE',
        menu_language: '🌐 Language: {lang}',
        menu_confirm: '✅ Confirm',
        menu_cancel: '❌ Cancel',
        nav_main: '🏠 Menu',
        status_repo_none: '❌ None',
        status_auto: 'Auto',
        status_auto_icon: '⚡ Auto',
        settings_title: '🎛 **Settings**',
        settings_project: 'Project',
        settings_cli: 'CLI',
        settings_ide: 'IDE',
        config_cli_title: '⚙️ **CLI Configuration**',
        config_cli_current: 'Current CLI',
        config_model_title: '🤖 **Model Configuration**',
        config_model_current: 'Current Model',
        config_model_cli: 'CLI',
        config_ide_title: '💻 **IDE Configuration**',
        config_ide_current: 'Current IDE',
        config_language_title: '🌐 **Language**',
        config_language_current: 'Current language',
        repo_select_title: '📁 **Select a project:**',
        repo_new_prompt: '📝 **New project name:**\n\n_Type and send it._',
        repo_ready: '🚀 Project **{repo}** is ready.',
        repo_selected: '✅ **Active project:** {repo}\n\n💬 What do you want to build?',
        welcome: '👋 **Welcome!**',
        awaiting_input: '💬 **Waiting for your instructions...**\n\n_Describe what you want to code, I will handle it!_',
        no_project: '⚠️ Please select a project first.',
        no_history: '📭 No history found for this project.',
        history_title: '📊 **History ({repo})**',
        save_failed: '❌ Save failed: {error}',
        save_ok: '💾 Save OK:\n`{path}`',
        notes_prompt: '📝 Send your note for the next manual save.',
        notes_updated: '📝 Notes updated: {notes}',
        ide_opened: '🚀 IDE launched: **{ide}** on `{repo}`',
        ide_opened_short: 'IDE opened: {ide}',
        ide_failed: '❌ Unable to launch IDE: {error}',
        help_title: '📚 **VibeRemote Help**',
        help_mode_title: '💬 **Conversation Mode:**',
        help_mode_desc: 'Send your request naturally:',
        help_mode_example: '_"Create a login form with validation"_',
        help_proj_title: '📁 **Project Selection:**',
        help_proj_desc: 'Use the 📁 Projects tile',
        help_cfg_title: '⚙️ **Configuration:**',
        help_cfg_desc: 'Customize CLI and model to your needs',
        help_cmd_title: '🔧 **Slash Commands:**',
        help_cmds: '/code - Select a project\n/cli - Configure CLI\n/model - Configure model\n/settings - Open settings\n/ide - Configure IDEs\n/lang - Change language\n/save - Manual save\n/history - History',
        main_body: '🤖 **{title}**\n\n📁 **Project:** {repo}\n⚙️ **CLI:** {cli}\n🤖 **Model:** {model}\n🌐 **Language:** {lang}\n\n💡 _Send your request naturally or use the tiles below._',
        status_processing: 'Running: {repo}',
        status_analyzing: '⏳ [{repo}] Analyzing...',
        status_generating: '🧠 (Attempt {attempt}/{max}) Generating...',
        status_testing: '⚡ (Attempt {attempt}/{max}) Testing...',
        run_success: '🎯 **Success!**\n\n📁 **Files:** {count}',
        run_failed: '❌ Failed after {max} attempts.',
        fatal_error: '💥 Error: {error}',
        language_set: '🌐 Active language: {lang}',
        language_name_fr: 'French',
        language_name_en: 'English',
        gui_no_project: '📂 No active project',
        gui_ready: 'Ready to code!',
        gui_welcome: 'Welcome! Select a project from Telegram or with the tiles below.',
        gui_notes_prompt: '📝 Send your notes using the input field.'
    }
};

function resolveLocale(locale) {
    if (!locale) return 'fr';
    const short = locale.toLowerCase().slice(0, 2);
    return DICTIONARY[short] ? short : 'fr';
}

export function languageName(locale, targetLocale = null) {
    const lang = resolveLocale(locale);
    const uiLocale = resolveLocale(targetLocale || locale);
    if (lang === 'en') return t(uiLocale, 'language_name_en');
    return t(uiLocale, 'language_name_fr');
}

export function t(locale, key, vars = {}) {
    const lang = resolveLocale(locale);
    const candidates = [lang, ...FALLBACK_LOCALES.filter(l => l !== lang)];

    let template = key;
    for (const candidate of candidates) {
        const dict = DICTIONARY[candidate] || {};
        if (Object.prototype.hasOwnProperty.call(dict, key)) {
            template = dict[key];
            break;
        }
    }

    return template.replace(/\{(\w+)\}/g, (_, name) => {
        if (Object.prototype.hasOwnProperty.call(vars, name)) {
            return String(vars[name]);
        }
        return `{${name}}`;
    });
}

export function normalizeLocale(locale) {
    return resolveLocale(locale);
}

