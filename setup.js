import fs from 'fs/promises';
import { createInterface } from 'readline';
import { execa } from 'execa';
import path from 'path';

const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function setup() {
    console.log("\n💎 --- VibeCoder Orchestrator: INSTALLATEUR --- 💎\n");

    try {
        // 1. Choix du dossier de code principal
        const defaultPath = "C:\\Users\\Marc\\Documents\\1G1R\\_Programmation";
        let baseProgPath = await question(`➡️ Dossier principal de vos projets [Défaut: ${defaultPath}]: `);
        if (!baseProgPath.trim()) baseProgPath = defaultPath;

        // 2. Variables Telegram
        const botToken = await question("➡️ Votre Token Bot Telegram: ");
        const telegramId = await question("➡️ Votre ID Telegram (numérique): ");

        if (!botToken.trim() || !telegramId.trim()) {
            throw new Error("Le Token et l'ID sont obligatoires.");
        }

        // 3. Création du fichier .env
        console.log("\n📝 Configuration du fichier .env...");
        const envContent = `BOT_TOKEN=${botToken.trim()}\nMY_TELEGRAM_ID=${telegramId.trim()}\nBASE_PROG_PATH=${baseProgPath.trim().replace(/\\/g, '\\\\')}\n`;
        await fs.writeFile('.env', envContent, 'utf8');

        // 4. Installation des dépendances
        console.log("\n📦 Installation des dépendances Node.js...");
        await execa('npm', ['install'], { stdio: 'inherit' });

        // 5. Initialisation de la mémoire
        console.log("\n🧠 Initialisation de la mémoire locale (QMD)...");
        if (!await fs.stat('memory').catch(() => false)) {
            await fs.mkdir('memory', { recursive: true });
        }

        console.log("\n✅ INSTALLATION TERMINÉE AVEC SUCCÈS !");
        console.log(`🚀 Lancez le bot avec : node index.js`);

    } catch (err) {
        console.error("\n❌ ERREUR LORS DE L'INSTALLATION :", err.message);
    } finally {
        rl.close();
    }
}

setup();
