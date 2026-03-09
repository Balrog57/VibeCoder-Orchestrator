import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import path from 'path';
import { 
    initMemory, 
    queryMemory, 
    saveSessionSummary, 
    appendToDailyLog,
    generateSummary,
    loadSessionHistory,
    manualSave
} from './utils/memory.js';
import { runArchitectAgent, runDeveloperAgent, runTechLeadAgent, buildAgentConfig } from './utils/agents.js';
import { applyCodeToFiles, executeAndTest, autoCommitGit, listRepos, createNewRepo } from './utils/actions.js';
import { scanAvailableClis, getAvailableModels } from './utils/cli-detector.js';

// Chargement et conversion de l'ID autorisé
const MY_TELEGRAM_ID = parseInt(process.env.MY_TELEGRAM_ID, 10);
const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: Infinity });

const MAX_RETRIES = 2;
const BASE_PROG_PATH = process.env.BASE_PROG_PATH || "C:\\Users\\Marc\\Documents\\1G1R\\_Programmation";
const REPO_PATH = process.cwd();

// --- GESTION DES SESSIONS ---
const sessions = {};
let AVAILABLE_CLIS = [];      // Sera peuplé dynamiquement
let AVAILABLE_MODELS = {};    // { claude: [...], gemini: [...] }
let FALLBACK_ORDER = [];      // Ordre de fallback dynamique

function getSession(chatId) {
    if (!sessions[chatId]) {
        sessions[chatId] = {
            activeRepo: null,
            state: "idle",
            defaultCli: null,
            defaultModel: null,
            lastPrompt: null,
            lastSummary: null,
            lastFiles: [],
            lastTestResult: null,
            saveNotes: '',
            isProcessing: false  // Protection contre les exécutions multiples
        };
    }
    return sessions[chatId];
}

// Initialiser les CLI disponibles au démarrage
async function initAvailableClis() {
    console.log('[CLI] Scan des CLI installés...');
    try {
        const clis = await scanAvailableClis();
        AVAILABLE_CLIS = clis.map(c => c.name);
        AVAILABLE_MODELS = Object.fromEntries(clis.map(c => [c.name, c.models]));
        FALLBACK_ORDER = clis.map(c => c.name); // Déjà trié par priorité
        
        console.log('[CLI] Disponibles:', AVAILABLE_CLIS.join(', '));
        console.log('[CLI] Fallback order:', FALLBACK_ORDER.join(' > '));
    } catch (err) {
        console.error('[CLI] Erreur lors du scan:', err);
        // Fallback hardcoded
        AVAILABLE_CLIS = ['claude', 'gemini', 'codex', 'qwen', 'opencode'];
        AVAILABLE_MODELS = {
            claude: ['sonnet', 'opus', 'haiku'],
            gemini: ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro'],
            codex: ['o3', 'o4-mini', 'gpt-4.1'],
            qwen: ['qwen3.5', 'qwen3', 'qwen2.5-coder'],
            opencode: []
        };
        FALLBACK_ORDER = ['claude', 'gemini', 'codex', 'qwen', 'opencode'];
    }
}

// --- SÉCURITÉ ---
bot.use(async (ctx, next) => {
    if (ctx.from && ctx.from.id !== MY_TELEGRAM_ID) return;
    return next();
});

// --- UI REPO SELECTION ---
async function showRepoSelection(ctx, page = 0) {
    console.log(`[UI] Affichage de la sélection de projets (Page ${page})...`);
    const repos = await listRepos(BASE_PROG_PATH);
    console.log(`[UI] ${repos.length} projets trouvés dans ${BASE_PROG_PATH}.`);

    const pageSize = 6;
    const start = page * pageSize;
    const currentRepos = repos.slice(start, start + pageSize);

    const buttons = currentRepos.map(repo => [Markup.button.callback(`📁 ${repo}`, `select_repo:${repo}`)]);
    const navButtons = [];
    if (page > 0) navButtons.push(Markup.button.callback("⬅️", `page:${page - 1}`));
    navButtons.push(Markup.button.callback("➕ Nouveau", "new_repo"));
    if (start + pageSize < repos.length) navButtons.push(Markup.button.callback("➡️", `page:${page + 1}`));
    buttons.push(navButtons);

    const text = "💎 **VibeCoder Orchestrator**\nChoisissez un projet :";
    const keyboard = Markup.inlineKeyboard(buttons);
    return ctx.callbackQuery ? ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard }) : ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
}

bot.command('code', ctx => {
    console.log(`[Command] /code reçu de ${ctx.chat.id}`);
    getSession(ctx.chat.id).state = "idle";
    return showRepoSelection(ctx, 0);
});

bot.action(/page:(.+)/, ctx => showRepoSelection(ctx, parseInt(ctx.match[1])));
bot.action("new_repo", ctx => {
    getSession(ctx.chat.id).state = "awaiting_repo_name";
    return ctx.editMessageText("📝 Nom du nouveau projet :");
});

bot.action(/select_repo:(.+)/, async (ctx) => {
    const repoName = ctx.match[1];
    const session = getSession(ctx.chat.id);
    session.activeRepo = repoName;
    session.state = "idle";
    return ctx.editMessageText(`✅ Projet **${repoName}** actif. Instructions ?`, { parse_mode: 'Markdown' });
});

// --- COMMANDE /cli ---
bot.command('cli', async (ctx) => {
    const session = getSession(ctx.chat.id);
    const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
    
    if (!args) {
        // Afficher le CLI actuel et les options avec boutons
        const currentCli = session.defaultCli || "⚡ Auto (fallback chain)";
        
        // Créer les boutons pour les CLI disponibles
        const buttons = AVAILABLE_CLIS.map(cli => 
            [Markup.button.callback(`${session.defaultCli === cli ? '✅' : '🔧'} ${cli}`, `set_cli:${cli}`)]
        );
        buttons.push([Markup.button.callback("🔄 Auto (fallback)", "set_cli:auto")]);
        buttons.push([Markup.button.callback("🔁 Refresh", "refresh_clis")]);
        
        return ctx.reply(
            `🛠 **Configuration CLI**\n\n` +
            `Actuel: **${currentCli}**\n\n` +
            `CLI installés: ${AVAILABLE_CLIS.length}\n` +
            `Choisissez un CLI par défaut :`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
        );
    }
    
    // Si argument fourni directement
    const cliName = args.toLowerCase();
    if (cliName === 'auto') {
        session.defaultCli = null;
        return ctx.reply("✅ CLI réinitialisé à **Auto (fallback chain)**", { parse_mode: 'Markdown' });
    }
    
    if (AVAILABLE_CLIS.includes(cliName)) {
        session.defaultCli = cliName;
        return ctx.reply(`✅ CLI par défaut défini sur **${cliName}**`, { parse_mode: 'Markdown' });
    }
    
    return ctx.reply(`❌ CLI inconnu. Disponibles: ${AVAILABLE_CLIS.join(', ')}, auto`);
});

bot.action('set_cli:auto', (ctx) => {
    const session = getSession(ctx.chat.id);
    session.defaultCli = null;
    return ctx.editMessageText("✅ CLI réinitialisé à **Auto (fallback chain)**", { parse_mode: 'Markdown' });
});

bot.action(/set_cli:(.+)/, (ctx) => {
    const session = getSession(ctx.chat.id);
    const cliName = ctx.match[1];
    session.defaultCli = cliName;
    return ctx.editMessageText(`✅ CLI par défaut défini sur **${cliName}**`, { parse_mode: 'Markdown' });
});

bot.action('refresh_clis', async (ctx) => {
    await ctx.answerCbQuery('🔍 Scan en cours...');
    await initAvailableClis();
    
    const buttons = AVAILABLE_CLIS.map(cli => 
        [Markup.button.callback(`🔧 ${cli}`, `set_cli:${cli}`)]
    );
    buttons.push([Markup.button.callback("🔄 Auto (fallback)", "set_cli:auto")]);
    
    return ctx.editMessageText(
        `🛠 **Configuration CLI**\n\n` +
        `CLI installés: ${AVAILABLE_CLIS.length}\n` +
        `Disponibles: ${AVAILABLE_CLIS.join(', ')}\n\n` +
        `Choisissez un CLI par défaut :`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );
});

// --- COMMANDE /model ---
bot.command('model', async (ctx) => {
    const session = getSession(ctx.chat.id);
    const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
    
    if (!args) {
        // Afficher le modèle actuel et les options avec boutons
        const currentModel = session.defaultModel || "⚡ Auto";
        const currentCli = session.defaultCli || FALLBACK_ORDER[0] || 'gemini';
        
        // Récupérer les modèles pour le CLI actuel
        let modelsForCli = AVAILABLE_MODELS[currentCli] || [];
        
        // Si pas de modèles détectés, essayer de les récupérer
        if (modelsForCli.length === 0 && AVAILABLE_CLIS.includes(currentCli)) {
            modelsForCli = await getAvailableModels(currentCli);
        }
        
        const buttons = modelsForCli.map(model => 
            [Markup.button.callback(`${session.defaultModel === model ? '✅' : '🤖'} ${model}`, `set_model:${model}`)]
        );
        
        // Boutons pour changer de CLI
        const cliButtons = AVAILABLE_CLIS.map(cli => 
            [Markup.button.callback(`🔧 CLI: ${cli}`, `change_model_cli:${cli}`)]
        );
        
        buttons.push([Markup.button.callback("🔄 Auto", "set_model:auto")]);
        buttons.push([Markup.button.callback("🔁 Refresh modèles", `refresh_models:${currentCli}`)]);
        buttons.push(...cliButtons);
        
        return ctx.reply(
            `🤖 **Configuration Modèle**\n\n` +
            `Actuel: **${currentModel}**\n` +
            `CLI: **${currentCli}**\n\n` +
            `Modèles disponibles (${modelsForCli.length}) :`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
        );
    }
    
    // Si argument fourni directement
    const modelName = args.toLowerCase();
    if (modelName === 'auto') {
        session.defaultModel = null;
        return ctx.reply("✅ Modèle réinitialisé à **Auto**", { parse_mode: 'Markdown' });
    }
    
    session.defaultModel = modelName;
    return ctx.reply(`✅ Modèle par défaut défini sur **${modelName}**`, { parse_mode: 'Markdown' });
});

bot.action('set_model:auto', (ctx) => {
    const session = getSession(ctx.chat.id);
    session.defaultModel = null;
    return ctx.editMessageText("✅ Modèle réinitialisé à **Auto**", { parse_mode: 'Markdown' });
});

bot.action(/set_model:(.+)/, (ctx) => {
    const session = getSession(ctx.chat.id);
    const modelName = ctx.match[1];
    session.defaultModel = modelName;
    return ctx.editMessageText(`✅ Modèle par défaut défini sur **${modelName}**`, { parse_mode: 'Markdown' });
});

// Changer le CLI depuis /model
bot.action(/change_model_cli:(.+)/, async (ctx) => {
    const session = getSession(ctx.chat.id);
    const newCli = ctx.match[1];
    session.defaultCli = newCli;
    
    // Récupérer les modèles pour le nouveau CLI
    let modelsForCli = AVAILABLE_MODELS[newCli] || [];
    if (modelsForCli.length === 0) {
        modelsForCli = await getAvailableModels(newCli);
    }
    
    const currentModel = session.defaultModel || "⚡ Auto";
    
    const buttons = modelsForCli.map(model => 
        [Markup.button.callback(`${session.defaultModel === model ? '✅' : '🤖'} ${model}`, `set_model:${model}`)]
    );
    
    const cliButtons = AVAILABLE_CLIS.map(cli => 
        [Markup.button.callback(`🔧 CLI: ${cli}`, `change_model_cli:${cli}`)]
    );
    
    buttons.push([Markup.button.callback("🔄 Auto", "set_model:auto")]);
    buttons.push([Markup.button.callback("🔁 Refresh modèles", `refresh_models:${newCli}`)]);
    buttons.push(...cliButtons);
    
    return ctx.editMessageText(
        `🤖 **Configuration Modèle**\n\n` +
        `Actuel: **${currentModel}**\n` +
        `CLI: **${newCli}**\n\n` +
        `Modèles disponibles (${modelsForCli.length}) :`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );
});

// Refresh les modèles pour un CLI
bot.action(/refresh_models:(.+)/, async (ctx) => {
    const cli = ctx.match[1];
    await ctx.answerCbQuery('🔍 Scan des modèles...');
    
    const models = await getAvailableModels(cli);
    AVAILABLE_MODELS[cli] = models;
    
    const session = getSession(ctx.chat.id);
    const currentModel = session.defaultModel || "⚡ Auto";
    
    const buttons = models.map(model => 
        [Markup.button.callback(`${session.defaultModel === model ? '✅' : '🤖'} ${model}`, `set_model:${model}`)]
    );
    
    const cliButtons = AVAILABLE_CLIS.map(c => 
        [Markup.button.callback(`🔧 CLI: ${c}`, `change_model_cli:${c}`)]
    );
    
    buttons.push([Markup.button.callback("🔄 Auto", "set_model:auto")]);
    buttons.push(...cliButtons);
    
    return ctx.editMessageText(
        `🤖 **Configuration Modèle**\n\n` +
        `Actuel: **${currentModel}**\n` +
        `CLI: **${cli}**\n\n` +
        `Modèles trouvés: ${models.length}\n` +
        `Modèles disponibles :`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );
});

// --- COMMANDE /help ---
bot.command('help', (ctx) => {
    ctx.reply(
        `💎 **VibeCoder Orchestrator - Aide**\n\n` +
        `📋 **Commandes disponibles**:\n\n` +
        `/code - Choisir un projet ou en créer un nouveau\n` +
        `/cli - Configurer le CLI par défaut (claude, gemini, qwen...)\n` +
        `/model - Configurer le modèle par défaut (sonnet, opus, gemini-2.5-pro...)\n` +
        `/settings - Voir les paramètres actuels de la session\n` +
        `/save [notes] - Sauvegarder manuellement la session dans MEMORY\n` +
        `/history - Voir l'historique des sessions du projet\n` +
        `/help - Afficher cette aide\n\n` +
        `📝 **Utilisation**:\n` +
        `1. Utilisez /code pour sélectionner un projet\n` +
        `2. Envoyez vos instructions en langage naturel\n` +
        `3. L'IA génère le code, teste et commit automatiquement\n` +
        `4. La session est auto-sauvegardée dans MEMORY\n\n` +
        `⚙️ **Exemples**:\n` +
        `/cli gemini - Utiliser Gemini exclusivement\n` +
        `/model sonnet - Utiliser Claude Sonnet\n` +
        `/cli auto - Retour au mode automatique (fallback)\n` +
        `/save Notes importantes sur cette session`,
        { parse_mode: 'Markdown' }
    );
});

// --- COMMANDE /settings ---
bot.command('settings', (ctx) => {
    const session = getSession(ctx.chat.id);
    const cli = session.defaultCli || "Auto (fallback chain)";
    const model = session.defaultModel || "Auto";
    const repo = session.activeRepo || "Aucun";
    
    ctx.reply(
        `⚙️ **Paramètres de la session**\n\n` +
        `📁 Projet: **${repo}**\n` +
        `🔧 CLI: **${cli}**\n` +
        `🤖 Modèle: **${model}**\n\n` +
        `Utilisez /cli pour changer le CLI\n` +
        `Utilisez /model pour changer le modèle`,
        { parse_mode: 'Markdown' }
    );
});

// --- COMMANDE /save ---
bot.command('save', async (ctx) => {
    const session = getSession(ctx.chat.id);
    const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
    
    if (!session.activeRepo) {
        return ctx.reply("⚠️ Aucun projet actif. Utilisez /code d'abord.");
    }
    
    // Sauvegarder les notes si fournies
    if (args) {
        session.saveNotes = args;
    }
    
    const result = await manualSave(BASE_PROG_PATH, session);
    
    if (result.success) {
        await ctx.reply(`💾 Session sauvegardée dans MEMORY!\n\n` +
            `📁 Projet: **${session.activeRepo}**\n` +
            `📝 Notes: ${session.saveNotes || 'Aucune'}`, 
            { parse_mode: 'Markdown' });
        
        // Reset notes after save
        session.saveNotes = '';
    } else {
        await ctx.reply(`❌ Erreur: ${result.error}`);
    }
});

// --- COMMANDE /history ---
bot.command('history', async (ctx) => {
    const session = getSession(ctx.chat.id);
    
    if (!session.activeRepo) {
        return ctx.reply("⚠️ Aucun projet actif. Utilisez /code d'abord.");
    }
    
    const history = await loadSessionHistory(BASE_PROG_PATH, session.activeRepo);
    
    if (history.length === 0) {
        return ctx.reply(`📜 Aucune session précédente pour **${session.activeRepo}**`, 
            { parse_mode: 'Markdown' });
    }
    
    let message = `📜 **Historique: ${session.activeRepo}**\n\n`;
    message += `${history.length} session(s) trouvée(s):\n\n`;
    
    for (const sess of history.slice(0, 5)) {
        // Extraire la date du filename
        const dateMatch = sess.filename.match(/(\d{4}-\d{2}-\d{2})/);
        const date = dateMatch ? dateMatch[1] : 'Inconnue';
        
        // Extraire le résumé du contenu
        const summaryMatch = sess.content.match(/## 🤖 Réponse IA\n([\s\S]*?)(?=\n##|$)/);
        const summary = summaryMatch ? summaryMatch[1].slice(0, 100) + '...' : 'Non disponible';
        
        message += `📅 ${date}\n${summary}\n\n`;
    }
    
    if (history.length > 5) {
        message += `... et ${history.length - 5} autres sessions.`;
    }
    
    return ctx.reply(message, { parse_mode: 'Markdown' });
});

// --- PIPELINE HANDLER ---
bot.on('text', async (ctx) => {
    const session = getSession(ctx.chat.id);
    const text = ctx.message.text.trim();

    // Protection: ignorer les messages du bot lui-même
    if (ctx.from && ctx.from.is_bot) return;
    
    // Protection: éviter les exécutions multiples
    if (session.isProcessing) {
        console.log('[Pipeline] Déjà en cours, message ignoré');
        return;
    }

    if (session.state === "awaiting_repo_name") {
        const res = await createNewRepo(BASE_PROG_PATH, text);
        if (res.success) {
            session.activeRepo = text;
            session.state = "idle";
            return ctx.reply(`🚀 Projet **${text}** prêt.`);
        }
        return ctx.reply(`❌ Erreur: ${res.error}`);
    }

    if (!session.activeRepo) return ctx.reply("⚠️ Tapez /code pour choisir un projet.");

    // Marquer comme en cours de traitement
    session.isProcessing = true;

    const prompt = text;
    const targetPath = path.join(BASE_PROG_PATH, session.activeRepo);
    const statusMsg = await ctx.reply(`⏳ [${session.activeRepo}] Analyse...`);

    const sendEdit = async (m) => {
        try { await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, m); } catch (e) { }
    };

    try {
        // Options personnalisées pour les agents
        const agentOptions = {
            defaultCli: session.defaultCli,
            defaultModel: session.defaultModel,
            preferredCli: null  // Sera défini après le premier succès
        };

        // Variables pour la sauvegarde mémoire
        let finalCode = "", filesCreated = [], testResult = "", sessionSummary = "";

        await initMemory(BASE_PROG_PATH);

        // Log du début de session dans le Daily Log
        await appendToDailyLog(BASE_PROG_PATH, session.activeRepo,
            `Démarrage: ${prompt.slice(0, 80)}...`);

        const memoryContext = await queryMemory(BASE_PROG_PATH, prompt);
        let attempt = 1, success = false, errorMessage = null;

        while (attempt <= MAX_RETRIES + 1) {
            await sendEdit(`🧠 (Essai ${attempt}/${MAX_RETRIES + 1}) Réflexion...`);
            
            // Architect - trouve le premier CLI qui marche
            const planResult = await runArchitectAgent(prompt, memoryContext, agentOptions);
            const plan = planResult.output;
            
            // Utiliser le MÊME CLI pour Developer et TechLead
            agentOptions.preferredCli = planResult.usedCli;
            console.log(`[Pipeline] CLI utilisé: ${planResult.usedCli} (réutilisé pour Developer/TechLead)`);
            
            // Developer - réutilise le même CLI
            const devResult = await runDeveloperAgent(plan, memoryContext, errorMessage, agentOptions);
            const devCode = devResult.output;
            
            // TechLead - réutilise le même CLI
            const techResult = await runTechLeadAgent(devCode, agentOptions);
            finalCode = techResult.output;

            await sendEdit(`💾 (Essai ${attempt}/${MAX_RETRIES + 1}) Écriture...`);
            filesCreated = await applyCodeToFiles(finalCode, targetPath);
            if (filesCreated.length === 0) {
                errorMessage = "Format non respecté (### FILE:).";
                attempt++; continue;
            }

            await sendEdit(`⚡ (Essai ${attempt}/${MAX_RETRIES + 1}) Tests...`);
            const test = await executeAndTest(finalCode, targetPath);
            testResult = test.message || test.error;
            if (test.success) { success = true; break; }
            errorMessage = test.error; attempt++;
        }

        // Générer un résumé automatique
        sessionSummary = await generateSummary(finalCode, prompt);

        if (success) {
            await sendEdit(`🔄 Commit Git dans ${session.activeRepo}...`);
            await autoCommitGit(targetPath, "VibeCode: " + prompt.slice(0, 30));
            
            // AUTO-SAVE: Sauvegarder la session dans MEMORY
            const saveResult = await saveSessionSummary(BASE_PROG_PATH, {
                repo: session.activeRepo,
                cli: agentOptions.defaultCli || 'auto',
                model: agentOptions.defaultModel || 'auto',
                prompt: prompt,
                summary: sessionSummary,
                filesCreated: filesCreated,
                testResult: testResult,
                success: true,
                attempts: attempt,
                tags: ['auto-saved', 'success'],
                notes: ''
            });
            
            if (saveResult.success) {
                console.log(`[Memory] Session auto-sauvegardée: ${saveResult.path}`);
            }
            
            // Mettre à jour la session pour /save manuel
            session.lastPrompt = prompt;
            session.lastSummary = sessionSummary;
            session.lastFiles = filesCreated;
            session.lastTestResult = testResult;
            
            await ctx.reply(`🎯 **Succès !**\n\n\`\`\`\n${finalCode.slice(0, 1000)}\n\`\`\``, { parse_mode: 'Markdown' });
        } else {
            // AUTO-SAVE même en cas d'échec
            await saveSessionSummary(BASE_PROG_PATH, {
                repo: session.activeRepo,
                cli: agentOptions.defaultCli || 'auto',
                model: agentOptions.defaultModel || 'auto',
                prompt: prompt,
                summary: `Échec après ${attempt} essais`,
                filesCreated: filesCreated,
                testResult: testResult,
                success: false,
                attempts: attempt,
                tags: ['auto-saved', 'failed'],
                notes: `Erreur: ${errorMessage}`
            });
            
            await ctx.reply(`❌ Échec après ${MAX_RETRIES + 1} essais.\n\nErreur: ${errorMessage}`);
        }
    } catch (e) {
        console.error(e);

        // AUTO-SAVE en cas d'erreur critique
        await saveSessionSummary(BASE_PROG_PATH, {
            repo: session.activeRepo,
            cli: agentOptions.defaultCli || 'auto',
            model: agentOptions.defaultModel || 'auto',
            prompt: prompt,
            summary: 'Erreur critique',
            filesCreated: [],
            testResult: '',
            success: false,
            attempts: 0,
            tags: ['auto-saved', 'error'],
            notes: `Erreur: ${e.message}`
        });

        await ctx.reply("💥 Erreur orchestrateur.");
    } finally {
        // Reset: autoriser un nouveau traitement
        session.isProcessing = false;
    }
});

// --- INIT ---
try {
    console.log("[Système] VibeCoder Orchestrator v2.5 - Role-based Fallback...");
    console.log("[Système] Commandes: /code, /cli, /model, /settings, /help, /save, /history");
    
    // Initialiser les CLI disponibles
    initAvailableClis();
    
    // Initialiser la mémoire
    initMemory(BASE_PROG_PATH);
    
    bot.launch();
    console.log("[Telegram] Connecté.");
} catch (e) { console.error(e); }

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
