import { appendToDailyLog } from './utils/memory.js';
import path from 'path';

const basePath = process.cwd();
const sessionName = 'Hello World Validation';
const event = 'Succès : Hello World exécuté avec succès via Node.js. Validation de l\'infrastructure VibeCoder terminée.';

async function record() {
    try {
        await appendToDailyLog(basePath, sessionName, event);
        console.log('Mémoire mise à jour avec succès.');
    } catch (err) {
        console.error('Erreur lors de la mise à jour de la mémoire :', err);
    }
}

record();
