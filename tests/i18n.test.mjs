import assert from 'node:assert/strict';
import { t, normalizeLocale } from '../utils/i18n.js';
import { createLanguageKeyboard } from '../utils/ui.js';

export async function run() {
    assert.equal(normalizeLocale('fr-FR'), 'fr');
    assert.equal(normalizeLocale('en-US'), 'en');
    assert.equal(normalizeLocale('de-DE'), 'fr');

    assert.match(t('fr', 'welcome'), /Bienvenue/i);
    assert.match(t('en', 'welcome'), /Welcome/i);
    assert.ok(t('xx', 'welcome').length > 0);

    const session = { locale: 'en' };
    const keyboard = createLanguageKeyboard(session);
    const labels = keyboard.reply_markup.inline_keyboard.flat().map(btn => btn.text);
    assert.ok(labels.some(l => l.includes('French') || l.includes('Francais')));
    assert.ok(labels.some(l => l.includes('English')));
}

