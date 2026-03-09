import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { initMemory, queryMemory, saveSessionMemory } from './utils/memory.js';
import { runArchitectAgent, runDeveloperAgent, runTechLeadAgent } from './utils/agents.js';
import { applyCodeToFiles, executeAndTest, autoCommitGit } from './utils/actions.js';

// Chargement et conversion de l'ID autorisé
const MY_TELEGRAM_ID = parseInt(process.env.MY_TELEGRAM_ID, 10);
const bot = new Telegraf(process.env.BOT_TOKEN);

const MAX_RETRIES = 2;
const REPO_PATH = process.cwd();

// --- SÉCURITÉ : Middleware de vérification d'identité ---
bot.use(async (ctx, next) => {
    if (ctx.from && ctx.from.id !== MY_TELEGRAM_ID) {
        console.warn(`[Index] Accès refusé pour l'utilisateur ${ctx.from.id}`);
        // Ne rien dire pour rester silencieux face aux attaquants
        return;
    }
    return next();
});

// --- CODE PRINCIPAL : Commande /code ---
bot.command('code', async (ctx) => {
    // Récupérer la commande complète sans le /code
    const prompt = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!prompt) {
        return ctx.reply("Veuillez fournir une description de votre requête. Ex: /code Modifie le header en rouge.");
    }

    // Status message initial
    const statusMsg = await ctx.reply("⏳ Démarrage de la séquence VibeCoder... Recherche en mémoire locale (QMD).");

    const sendEdit = async (message) => {
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, message);
        } catch (e) {
            console.error('Erreur édition Telegram:', e.message);
        }
    };

    try {
        // 1. Recherche en mémoire locale
        const memoryContext = await queryMemory(prompt);

        // 2. Génération du plan par l'Architecte
        await sendEdit("🏗️ L'Architecte analyse et conçoit un plan d'action...");
        const plan = await runArchitectAgent(prompt, memoryContext);

        let errorMessage = null;
        let success = false;
        let finalCode = "";

        // Boucle d'auto-correction (Self-Healing)
        for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
            await sendEdit(`💻 (Essai ${attempt}/${MAX_RETRIES + 1}) Le Développeur génère le code...`);

            // 3. Le Développeur implémente
            const developerCode = await runDeveloperAgent(plan, memoryContext, errorMessage);

            // 4. Le Tech Lead vérifie et formate correctement pour la machine
            await sendEdit(`🔎 (Essai ${attempt}/${MAX_RETRIES + 1}) Le Tech Lead formate et vérifie la proposition...`);
            finalCode = await runTechLeadAgent(developerCode);

            // 5. Actions physiques : écriture et exécution
            await sendEdit(`💾 (Essai ${attempt}/${MAX_RETRIES + 1}) Application des modifications sur le disque...`);
            const writtenFiles = await applyCodeToFiles(finalCode, REPO_PATH);

            if (writtenFiles.length === 0) {
                // Aucun fichier généré, peut-être une erreur de formatage ?
                errorMessage = "Le Tech Lead n'a généré aucun fichier valide respectant le format `### FILE:`. Reformate ta réponse.";
                continue;
            }

            await sendEdit(`⚡ (Essai ${attempt}/${MAX_RETRIES + 1}) Exécution des tests...`);
            const testResult = await executeAndTest(finalCode, REPO_PATH);

            if (testResult.success) {
                success = true;
                await sendEdit(`✅ (Essai ${attempt}/${MAX_RETRIES + 1}) L'exécution a réussi sans erreur.`);
                break; // Sort de la boucle
            } else {
                errorMessage = testResult.error;
                await sendEdit(`⚠️ (Essai ${attempt}/${MAX_RETRIES + 1}) Échec de l'exécution. Rapport de bug transmis pour auto-correction.`);
                // On boucle à l'essai suivant
            }
        }

        if (success) {
            // 6. Succès : Commit et sauvegarde
            await sendEdit("🔄 Validation des changements avec un commit Git...");
            await autoCommitGit(REPO_PATH, "Auto-résolution pour: " + prompt.slice(0, 30));

            // Sauvegarder la mémoire
            await saveSessionMemory("VibeCode", `**Requête:** ${prompt}\n\n**Résultat final généré :**\n${finalCode}`, {
                prompt: prompt,
                success: true
            });

            await sendEdit("🎉 Séquence complétée avec succès ! Les fichiers ont été écrits et commités.");
        } else {
            // Échec global après les retries
            await sendEdit("❌ Échec de la séquence après plusieurs essais. Revoyez votre prompt, l'agent n'a pas réussi à réparer l'erreur:\n\n`" + errorMessage.substring(0, 2000) + "`");

            // Sauvegarder l'échec dans la mémoire pour apprentissage futur
            await saveSessionMemory("Echec-VibeCode", `**Requête:** ${prompt}\n\n**Dernière Erreur:** ${errorMessage}`, {
                prompt: prompt,
                success: false
            });
        }

    } catch (globalError) {
        console.error("Erreur globale d'orchestration:", globalError);
        await sendEdit(`❌ Une erreur critique est survenue dans l'orchestrateur : ${globalError.message}`);
    }
});

// Initialisation globale
try {
    console.log("[Système] Démarrage de VibeCoder Orchestrator v2.1...");
    await initMemory();
    bot.launch();
    console.log("[Telegram] Bot connecté et en attente des commandes.");

    // Arrêt propre
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

} catch (e) {
    console.error("Erreur fatale au lancement:", e);
}
