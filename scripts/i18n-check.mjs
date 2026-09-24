#!/usr/bin/env node
// Every English string the app translates must have a Malay entry.
//
//   node scripts/i18n-check.mjs          (needs `npm run build` first: reads dist/)
//   node scripts/i18n-check.mjs --list   (print all strings, for translating)
//
// Collects: t('…') / $t('…') / N_('…') / tn(n, '…', '…') calls in src/js and in the
// built pages, [data-t] element text and [data-t-attr] attribute values.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(p, 'utf8');
const unescape = (s) => s.replace(/\\(.)/g, '$1');

/** String literals passed to the translator functions in some JS/HTML text. */
export function keysInCode(text) {
    const keys = new Set();
    const call = /(^|[^\w.$])(\$?t|\$?tn|tr|N_)\(/g;
    let m;
    while ((m = call.exec(text))) {
        const fn = m[2].replace('$', '');
        // Walk the argument list, tracking nesting and quotes.
        let i = call.lastIndex;
        let depth = 1;
        let arg = 0;
        const literals = [];
        while (i < text.length && depth > 0) {
            const c = text[i];
            if (c === "'" || c === '"' || c === '`') {
                let j = i + 1;
                while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
                if (depth === 1 && c === "'") literals.push({ arg, value: unescape(text.slice(i + 1, j)) });
                i = j + 1;
                continue;
            }
            if (c === '(' || c === '{' || c === '[') depth++;
            else if (c === ')' || c === '}' || c === ']') depth--;
            else if (c === ',' && depth === 1) arg++;
            i++;
        }
        for (const { arg: a, value } of literals) {
            if (value && (fn === 'tn' ? a === 1 || a === 2 : a === 0)) keys.add(value);
        }
    }
    return keys;
}

/** [data-t] text and [data-t-attr] attribute values in built HTML. */
export function keysInHtml(html) {
    const keys = new Set();
    const decode = (s) => s.replace(/&#8217;/g, '’').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    // Attributes may contain ">" (x-show="n > 1"), so match them properly.
    const attrs = String.raw`((?:\s+[^\s"'=<>/]+(?:=(?:"[^"]*"|'[^']*'))?)*)\s*`;
    const hasAttr = (list, name) => new RegExp(String.raw`(?:^|\s)${name}(?=[\s=]|$)`).test(list);
    const attrValue = (list, name) => list.match(new RegExp(String.raw`(?:^|\s)${name}="([^"]*)"`))?.[1];
    for (const m of html.matchAll(new RegExp(String.raw`<(\w+)${attrs}>([^<]*)</\1>`, 'g'))) {
        if (!hasAttr(m[2], 'data-t')) continue;
        const text = decode(m[3]).replace(/\s+/g, ' ').trim();
        if (text) keys.add(text);
    }
    for (const m of html.matchAll(new RegExp(String.raw`<[\w-]+${attrs}/?>`, 'g'))) {
        const names = attrValue(m[1], 'data-t-attr');
        if (!names) continue;
        for (const name of names.split(/\s+/)) {
            const value = attrValue(m[1], name);
            if (value) keys.add(decode(value));
        }
    }
    return keys;
}

export async function collect() {
    const keys = new Set();
    const add = (set) => set.forEach((k) => keys.add(k));
    for (const file of fs.readdirSync(path.join(root, 'src/js'))) {
        if (file.endsWith('.js') && file !== 'i18n-ms.js') add(keysInCode(read(path.join(root, 'src/js', file))));
    }
    const dist = path.join(root, 'dist');
    if (!fs.existsSync(dist)) throw new Error('Run `npm run build` first.');
    for (const file of fs.readdirSync(dist).filter((f) => f.endsWith('.html'))) {
        const html = read(path.join(dist, file));
        add(keysInHtml(html));
        add(keysInCode(html));
    }
    return keys;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { MS } = await import('../src/js/i18n-ms.js');
    const keys = await collect();
    if (process.argv.includes('--list')) {
        [...keys].sort().forEach((k) => console.log(JSON.stringify(k)));
        process.exit(0);
    }
    const missing = [...keys].filter((k) => !(k in MS)).sort();
    const unused = Object.keys(MS).filter((k) => !keys.has(k)).sort();
    if (unused.length) console.log(`Unused Malay entries (${unused.length}):\n  ${unused.map((k) => JSON.stringify(k)).join('\n  ')}`);
    if (missing.length) {
        console.error(`Missing Malay translations (${missing.length}):\n  ${missing.map((k) => JSON.stringify(k)).join('\n  ')}`);
        process.exit(1);
    }
    console.log(`All ${keys.size} strings have a Malay translation.`);
}
