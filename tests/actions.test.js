import fs from 'fs/promises';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    createNewRepo,
    listDirectoryNodes,
    parseCommandLine,
    resolvePathInsideRepo,
    resolveWorkspacePath
} from '../utils/actions.js';

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

describe('actions workspace helpers', () => {
    it('resolves a workspace path inside the base directory', () => {
        const result = resolveWorkspacePath('C:/workspace', 'demo/app');
        expect(result.relativePath).toBe('demo/app');
        expect(result.absolutePath.replace(/\\/g, '/')).toContain('/workspace/demo/app');
    });

    it('rejects path traversal outside the workspace', () => {
        expect(() => resolveWorkspacePath('C:/workspace', '../outside')).toThrow(/hors workspace/i);
    });

    it('rejects absolute file paths outside the repo', () => {
        expect(() => resolvePathInsideRepo('C:/workspace/demo', 'C:/Windows/win.ini')).toThrow(/absolu interdit/i);
    });

    it('parses quoted commands without enabling shell chaining', () => {
        expect(parseCommandLine('npm run test -- --watch=false')).toEqual({
            cmd: 'npm',
            args: ['run', 'test', '--', '--watch=false']
        });
        expect(parseCommandLine('node "my script.js"')).toEqual({
            cmd: 'node',
            args: ['my script.js']
        });
        expect(() => parseCommandLine('npm test && echo nope')).toThrow(/interdits/i);
    });

    it('lists directory nodes and creates a repo in the current folder', async () => {
        const root = await makeTempRoot('actions');
        await fs.mkdir(path.join(root, 'alpha', 'nested'), { recursive: true });
        await fs.mkdir(path.join(root, 'beta'), { recursive: true });

        const browser = await listDirectoryNodes(root, 'alpha');
        expect(browser.currentPath).toBe('alpha');
        expect(browser.parentPath).toBe('');
        expect(browser.entries.map(entry => entry.name)).toEqual(['nested']);

        const created = await createNewRepo(root, 'new-cli-remote', 'alpha');
        expect(created.success).toBe(true);
        expect(created.relativePath).toBe('alpha/new-cli-remote');

        const gitignore = await fs.readFile(path.join(root, 'alpha', 'new-cli-remote', '.gitignore'), 'utf8');
        expect(gitignore).toContain('node_modules/');
    });
});
