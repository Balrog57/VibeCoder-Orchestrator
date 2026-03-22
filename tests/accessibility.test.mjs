import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';

function hexToRgb(hex) {
    const clean = hex.replace('#', '').trim();
    const full = clean.length === 3
        ? clean.split('').map(ch => ch + ch).join('')
        : clean;
    const num = parseInt(full, 16);
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}

function channelToLinear(v) {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

function contrastRatio(fg, bg) {
    const l1 = luminance(fg);
    const l2 = luminance(bg);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

function extractVar(css, name) {
    const re = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,6})\\s*;`);
    const match = css.match(re);
    return match ? match[1] : null;
}

export async function run() {
    const root = process.cwd();
    const html = await fs.readFile(path.join(root, 'gui', 'index.html'), 'utf8');
    const css = await fs.readFile(path.join(root, 'gui', 'style.css'), 'utf8');

    assert.match(html, /<html lang="fr">/i);
    assert.match(html, /id="messages-list"[^>]*role="log"/i);
    assert.match(html, /id="status-text"[^>]*aria-live="polite"/i);
    assert.match(html, /id="active-repo"[^>]*aria-live="polite"/i);
    assert.match(html, /id="send-btn"[^>]*type="button"/i);
    assert.match(css, /prefers-reduced-motion:\s*reduce/i);

    const secondary = extractVar(css, '--secondary-color');
    const text = extractVar(css, '--text-color');
    const white = extractVar(css, '--white');
    assert.ok(secondary && text && white, 'required color vars missing');

    const ratioSecondaryOnWhite = contrastRatio(secondary, white);
    const ratioTextOnWhite = contrastRatio(text, white);

    assert.ok(ratioSecondaryOnWhite >= 4.5, `secondary on white too low: ${ratioSecondaryOnWhite.toFixed(2)}`);
    assert.ok(ratioTextOnWhite >= 4.5, `text on white too low: ${ratioTextOnWhite.toFixed(2)}`);
}

