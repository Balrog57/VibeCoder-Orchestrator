import { describe, expect, it } from 'vitest';
import { buildCliAdapters, getCliAdapter } from '../utils/cli-adapters.js';

describe('cli adapters', () => {
    it('builds an adapter contract for a known CLI', () => {
        const adapter = getCliAdapter('claude');
        expect(adapter).toBeTruthy();
        expect(adapter.name).toBe('claude');
        expect(typeof adapter.detect).toBe('function');
        expect(typeof adapter.listModels).toBe('function');
        expect(typeof adapter.execute).toBe('function');
        expect(adapter.supportsRemote()).toBe(true);
    });

    it('prepares execution arguments according to CLI conventions', () => {
        const claude = getCliAdapter('claude');
        expect(claude.prepareExecution({ prompt: 'hello', model: 'sonnet' })).toEqual({
            args: ['--dangerously-skip-permissions', '-p', 'hello', '--model', 'sonnet'],
            input: undefined
        });

        const codex = getCliAdapter('codex');
        expect(codex.prepareExecution({ prompt: 'fix tests', model: 'o4-mini' })).toEqual({
            args: ['exec', '-m', 'o4-mini', 'fix tests'],
            input: undefined
        });
    });

    it('builds adapters only for known names', () => {
        const adapters = buildCliAdapters(['claude', 'missing', 'codex']);
        expect(adapters.map(adapter => adapter.name)).toEqual(['claude', 'codex']);
    });
});
