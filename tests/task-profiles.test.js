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
    });

    it('exposes profile metadata and prompt instructions', () => {
        const review = getTaskProfile('review');
        expect(review.preferredCli).toBe('claude');

        const prompt = buildTaskProfilePrompt('fix');
        expect(prompt).toContain('PROFIL ACTIF: Correction');
        expect(prompt).toContain('corriger rapidement une erreur');
    });
});
