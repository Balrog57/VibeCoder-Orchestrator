/**
 * UI Module - Inline Keyboards & Telegram Interface
 * Inspiré de gemini_cli_server et GeminiCLI_Slash_Listen
 */

import { Markup } from 'telegraf';

const escapeMd = (str) => str ? str.toString().replace(/[_*[\]()~`>#\+\-=|{}\.!]/g, '\\\\$&') : '';

/**
 * Menu Principal - Tuiles d'actions rapides
 */
export function createMainMenuKeyboard(session) {
    const repoStatus = session.activeRepo ? `✅ ${session.activeRepo}` : '❌ Aucun';
    
    return Markup.inlineKeyboard([
        // Ligne 1: Navigation Repo
        [Markup.button.callback('📁 Projets', 'nav:repos')],
        
        // Ligne 2: Actions de Code
        [
            Markup.button.callback('💬 Coder', 'action:code'),
            Markup.button.callback('🔧 Config', 'nav:config')
        ],
        
        // Ligne 3: Outils
        [
            Markup.button.callback('📊 Historique', 'action:history'),
            Markup.button.callback('⚙️ Settings', 'nav:settings')
        ],
        
        // Ligne 4: Aide
        [Markup.button.callback('❓ Aide', 'action:help')]
    ]);
}

/**
 * Menu de Navigation Repo
 */
export async function createRepoKeyboard(repos, page = 0) {
    const pageSize = 6;
    const start = page * pageSize;
    const currentRepos = repos.slice(start, start + pageSize);

    const buttons = currentRepos.map(repo => 
        [Markup.button.callback(`📁 ${repo}`, `select_repo:${repo}`)]
    );
    
    // Boutons de navigation
    const navButtons = [];
    if (page > 0) navButtons.push(Markup.button.callback('⬅️', `page:${page - 1}`));
    navButtons.push(Markup.button.callback('➕ Nouveau', 'new_repo'));
    if (start + pageSize < repos.length) navButtons.push(Markup.button.callback('➡️', `page:${page + 1}`));
    buttons.push(navButtons);
    
    // Bouton retour
    buttons.push([Markup.button.callback('🔙 Retour', 'nav:main')]);

    return Markup.inlineKeyboard(buttons);
}

/**
 * Menu de Configuration CLI
 */
export function createConfigKeyboard(session, availableClis) {
    const currentCli = session.defaultCli || '⚡ Auto';
    
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
        Markup.button.callback('🔄 Reset Auto', 'set_cli:auto'),
        Markup.button.callback('🔁 Refresh', 'refresh_clis')
    ]);
    
    buttons.push([Markup.button.callback('🔙 Retour', 'nav:main')]);

    return Markup.inlineKeyboard(buttons);
}

/**
 * Menu de Configuration Model
 */
export function createModelKeyboard(session, availableModels) {
    const currentCli = session.defaultCli || 'auto';
    const currentModel = session.defaultModel || '⚡ Auto';
    
    // Déterminer quel CLI utiliser pour afficher les modèles
    let cliToShow = currentCli;
    if (cliToShow === 'auto' || !cliToShow) {
        cliToShow = Object.keys(availableModels)[0] || 'gemini';
    }
    
    const models = availableModels[cliToShow] || [];
    
    const buttons = models.map(model => {
        const isDefault = session.defaultModel === model;
        return [
            Markup.button.callback(`${isDefault ? '⭐' : '🔹'} ${model}`, `set_model:${model}`)
        ];
    });
    
    buttons.push([Markup.button.callback('🔄 Reset Auto', 'set_model:auto')]);
    buttons.push([Markup.button.callback('🔙 Retour', 'nav:config')]);

    return Markup.inlineKeyboard(buttons);
}

/**
 * Menu Settings
 */
export function createSettingsKeyboard(session) {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('🎯 CLI: ' + (session.defaultCli || 'Auto'), 'nav:config'),
            Markup.button.callback('🤖 Model: ' + (session.defaultModel || 'Auto'), 'nav:model')
        ],
        [
            Markup.button.callback('📝 Notes: ' + (session.saveNotes || 'Aucune'), 'action:set_notes')
        ],
        [Markup.button.callback('🔙 Retour', 'nav:main')]
    ]);
}

/**
 * Keyboard de confirmation
 */
export function createConfirmKeyboard(confirmAction, cancelAction = 'nav:main') {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('✅ Confirmer', confirmAction),
            Markup.button.callback('❌ Annuler', cancelAction)
        ]
    ]);
}

/**
 * Messages formatés
 */
export const Messages = {
    main: (session) => {
        const repoStatus = session.activeRepo ? `✅ ${escapeMd(session.activeRepo)}` : '❌ Aucun';
        const cliStatus = session.defaultCli || '⚡ Auto';
        const modelStatus = session.defaultModel || '⚡ Auto';
        
        return `🤖 **VibeCoder Orchestrator**

📁 **Projet:** ${repoStatus}
⚙️ **CLI:** ${cliStatus}
🤖 **Model:** ${modelStatus}

💡 _Envoyez vos instructions naturellement ou utilisez les tuiles ci-dessous._`;
    },
    
    repoSelected: (repoName) => `✅ **Projet activé:** ${escapeMd(repoName)}\n\n💬 Que voulez-vous coder ?`,
    
    codeSuccess: (filesCreated, testResult) => {
        let msg = `🎯 **Succès !**\n\n`;
        msg += `📁 **Fichiers:** ${filesCreated.length}\n`;
        filesCreated.forEach(f => msg += `   \`${f}\`\n`);
        
        if (testResult && testResult.success) {
            msg += `\n✅ **Tests:** OK\n`;
        }
        
        return msg;
    },
    
    codeError: (error, attempts) => `❌ **Échec après ${attempts} essais**\n\nErreur: ${error}`,
    
    help: `📚 **Aide VibeCoder Orchestrator**

💬 **Mode Conversationnel:**
Envoyez simplement vos instructions naturellement :
_"Crée un formulaire de login avec validation"_

📁 **Sélection de Projet:**
Utilisez la tuile 📁 Projets pour choisir

⚙️ **Configuration:**
Personnalisez CLI et Model selon vos besoins

🔧 **Commandes Slash:**
/code - Sélectionner un projet
/cli - Configurer le CLI
/model - Configurer le model
/settings - Voir les settings
/save - Sauvegarder la session
/history - Historique`,

    awaitingInput: `💬 **En attente de vos instructions...**\n\n_Décrivez ce que vous voulez coder, je m'occupe de tout !_`
};
