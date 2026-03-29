import fs from 'fs/promises';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    getProjectMemoryPath,
    getWeeklyLogPath,
    manualSave,
    simpleTextSearch
} from '../utils/memory.js';

const tempRoots = [];

async function makeTempRoot(name) {
    const root = path.join(process.cwd(), `.tmp-tests-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    tempRoots.push(root);
    await fs.mkdir(root, { recursive: true });
    return root;
}

afterEach(async () => {
    while (tempRoots.length) {
        const target = tempRoots.pop();
        await fs.rm(target, { recursive: true, force: true });
    }
});

describe('memory helpers', () => {
    it('builds an ISO weekly markdown path', () => {
        const weekly = getWeeklyLogPath('C:/workspace/MEMORY', new Date('2026-03-29T10:00:00Z'));
        expect(weekly.replace(/\\/g, '/')).toMatch(/MEMORY\/weekly\/2026-W13\.md$/);
    });

    it('persists a manual save with weekly and project memory files', async () => {
        const root = await makeTempRoot('memory');
        const session = {
            activeRepo: 'VibeRemote',
            defaultCli: 'claude',
            defaultModel: 'sonnet',
            lastPrompt: 'Ajoute une page login',
            lastSummary: 'Page login creee',
            lastFiles: ['src/login.js'],
            lastTestResult: 'Tests OK',
            saveNotes: 'Priorite au mobile'
        };

        const result = await manualSave(root, session);
        expect(result.success).toBe(true);

        const sessionsDir = path.join(root, 'MEMORY', 'sessions');
        const savedFiles = await fs.readdir(sessionsDir);
        expect(savedFiles.some(name => name.includes('VibeRemote'))).toBe(true);

        const weeklyDir = path.join(root, 'MEMORY', 'weekly');
        const weeklyFiles = await fs.readdir(weeklyDir);
        expect(weeklyFiles.length).toBeGreaterThan(0);

        const projectMemory = await fs.readFile(getProjectMemoryPath(root, 'VibeRemote'), 'utf8');
        expect(projectMemory).toContain('Latest Request');
        expect(projectMemory).toContain('Ajoute une page login');
    });

    it('finds lexical context in markdown as a BM25-style fallback', async () => {
        const root = await makeTempRoot('memory-search');
        const memoryDir = path.join(root, 'MEMORY');
        await fs.mkdir(path.join(memoryDir, 'sessions'), { recursive: true });
        await fs.writeFile(
            path.join(memoryDir, 'sessions', '2026-03-29-demo.md'),
            '# Session\nLe bug login mobile casse le formulaire de connexion.\n',
            'utf8'
        );

        const result = await simpleTextSearch(memoryDir, 'bug login mobile');
        expect(result).toContain('bug login mobile');
        expect(result).toContain('2026-03-29-demo.md');
    });
});
