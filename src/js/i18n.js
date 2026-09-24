// English / Bahasa Melayu. The English text is the key (and the fallback):
//
//   JS:        t('Propose event'), t('{n} dates', { n: 3 })
//   Alpine:    x-text="$t('Propose event')"
//   HTML:      <span data-t>Propose event</span>             (text of a leaf element)
//              <input data-t-attr="placeholder" placeholder="Where?">
//
// Static markup is translated once when the page loads (also inside
// <template>s, before Alpine clones them); switching language reloads the
// page, so nothing else needs to react. Malay strings live in i18n-ms.js;
// `npm run test:unit` fails if one is missing.
import Alpine from 'alpinejs';
import { MS } from './i18n-ms.js';

const LANG_KEY = 'planly.lang';
export const LANGUAGES = [
    { id: 'en', label: 'English' },
    { id: 'ms', label: 'Bahasa Melayu' },
];

function readLang() {
    try {
        const saved = window.localStorage.getItem(LANG_KEY);
        if (saved === 'en' || saved === 'ms') return saved;
    } catch {
        // No storage: fall back to the device language.
    }
    return (navigator.language || '').toLowerCase().startsWith('ms') ? 'ms' : 'en';
}

export const lang = readLang();
/** For Intl date/number formatting. */
export const locale = lang === 'ms' ? 'ms-MY' : 'en-GB';

/** Translate an English string; {name} placeholders are filled from params. */
export function t(text, params) {
    let out = lang === 'ms' ? (MS[text] ?? text) : text;
    if (params) out = out.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
    return out;
}

/** Marks a string for translation where it's defined; t() translates it where it's shown. */
export const N_ = (text) => text;

/** "1 date" / "3 dates": English picks by count; Malay has one form. */
export function tn(n, one, many, params = {}) {
    return t(n === 1 ? one : many, { n, ...params });
}

/** Save the choice and reload in the new language. */
export async function setLang(next) {
    if (next === lang) return;
    try {
        window.localStorage.setItem(LANG_KEY, next);
    } catch {
        // Can't remember it on this device; the profile still does (below).
    }
    await window.Planly?.saveLang?.(next);
    window.location.reload();
}

/** Translate [data-t] text and [data-t-attr] attributes under root, templates included. */
export function translateDom(root = document) {
    if (lang === 'en') return;
    for (const el of root.querySelectorAll('[data-t]')) {
        const source = el.textContent.replace(/\s+/g, ' ').trim();
        if (source) el.textContent = t(source);
    }
    for (const el of root.querySelectorAll('[data-t-attr]')) {
        for (const name of el.getAttribute('data-t-attr').split(/\s+/)) {
            const value = el.getAttribute(name);
            if (value) el.setAttribute(name, t(value));
        }
    }
    for (const template of root.querySelectorAll('template')) translateDom(template.content);
}

Alpine.magic('t', () => t);
Alpine.magic('tn', () => tn);
Alpine.store('i18n', { lang, languages: LANGUAGES, set: setLang });

// Page titles ("Sign in · Planly") come from each page's layout directive.
const PAGE_TITLES = [N_('Home'), N_('Itinerary'), N_('Expenses'), N_('Members'), N_('Sign in'), N_('Waiting for approval'), N_('Page not found')];

document.documentElement.lang = lang;
translateDom();
const [pageTitle, ...titleRest] = document.title.split(' · ');
if (titleRest.length && PAGE_TITLES.includes(pageTitle)) document.title = [t(pageTitle), ...titleRest].join(' · ');
