import { execa } from 'execa';
import fs from 'fs/promises';
import path from 'path';

const memoryPath = path.resolve(process.cwd(), 'memory');

// Initialiser le dossier de mémoire s'il n'existe pas
export async function initMemory() {
    try {
        await fs.mkdir(memoryPath, { recursive: true });
    } catch (err) {
        console.error('Erreur lors de la création du dossier memory:', err);
    }
}

// Interroger la mémoire locale via qmd
export async function queryMemory(prompt) {
    try {
        const { stdout } = await execa('qmd', [prompt], { cwd: memoryPath });
        return stdout;
    } catch (err) {
        console.warn('Requête mémoire échouée ou qmd introuvable. Mémoire vide retournée.', err.message);
        return '';
    }
}

// Sauvegarder l'historique de la session
export async function saveSessionMemory(sessionName, content, frontmatter = {}) {
    const date = new Date().toISOString().split('T')[0];
    const filename = `${date}-${sessionName}.md`;
    const filePath = path.join(memoryPath, filename);

    let fmString = '---\n';
    for (const [key, value] of Object.entries(frontmatter)) {
        fmString += `${key}: ${value}\n`;
    }
    fmString += '---\n\n';

    try {
        await fs.writeFile(filePath, fmString + content, 'utf8');
    } catch(err) {
        console.error('Erreur de sauvegarde de la session:', err);
    }
}
