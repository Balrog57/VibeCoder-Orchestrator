import { describe, expect, it } from 'vitest';
import { buildRemotePrompt, classifyFailureReason, shouldTriggerFallback } from '../utils/agents.js';

describe('agent fallback helpers', () => {
    it('classifies common recoverable failures', () => {
        expect(classifyFailureReason('Rate limit exceeded', 1, false)).toBe('rate_limit');
        expect(classifyFailureReason('billing quota reached', 1, false)).toBe('quota_limit');
        expect(classifyFailureReason('context length exceeded', 1, false)).toBe('token_limit');
        expect(classifyFailureReason('authentication failed', 1, false)).toBe('auth_error');
        expect(classifyFailureReason('', null, true)).toBe('timeout');
    });

    it('marks empty output and non-zero exits as fallback-worthy', () => {
        expect(shouldTriggerFallback({
            stdout: '',
            stderr: '',
            exitCode: 0,
            failed: false,
            timedOut: false
        })).toMatchObject({
            failed: true,
            reason: 'empty_output'
        });

        expect(shouldTriggerFallback({
            stdout: 'ok',
            stderr: '',
            exitCode: 0,
            failed: false,
            timedOut: false
        })).toMatchObject({
            failed: false,
            reason: 'empty_output'
        });
    });

    it('injects the active task profile into the generated prompt', () => {
        const prompt = buildRemotePrompt({
            prompt: 'relis ce patch',
            context: 'Contexte demo',
            taskProfile: 'review'
        });

        expect(prompt).toContain('PROFIL ACTIF: Revue');
        expect(prompt).toContain('Priorise les bugs, regressions, risques de comportement et tests manquants.');
        expect(prompt).toContain('Contexte demo');
        expect(prompt).toContain('relis ce patch');
    });
});
