import { describe, expect, it } from 'vitest';
import {
    buildTaskProfilePrompt,
    getTaskProfile,
    normalizeTaskProfile
} from '../utils/task-profiles.js';

describe('task profiles', () => {
    it('normalizes unknown profiles to code', () => {
        expect(normalizeTaskProfile('unknown')).toBe('code');
        expect(getTaskProfile('unknown').id).toBe('code');
        expect(normalizeTaskProfile('plan')).toBe('plan');
        expect(normalizeTaskProfile('verify')).toBe('verify');
    });

    it('exposes profile metadata and prompt instructions', () => {
        const review = getTaskProfile('review');
        expect(review.preferredCli).toBe('claude');
        expect(getTaskProfile('implement').preferredCli).toBe('codex');

        const prompt = buildTaskProfilePrompt('fix');
        expect(prompt).toContain('PROFIL ACTIF: Correction');
        expect(prompt).toContain('corriger rapidement une erreur');

        const planPrompt = buildTaskProfilePrompt('plan');
        expect(planPrompt).toContain('PROFIL ACTIF: Plan');
        expect(planPrompt).toContain('proposer un plan d action concret');
    });
});
