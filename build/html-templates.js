// Build-time HTML templating for the static site (replaces Blade).
//
// Pages (src/*.html) may start with a layout directive:
//     <!-- layout: app | title: Home | access: approved -->
// The page body replaces <!-- content --> in src/layouts/<layout>.html, and
// {{ key }} placeholders in the layout are filled from the directive.
//
// Anywhere:
//   <include src="partials/logo.html" size="h-8 w-8"></include>
//       inlines a partial; its attributes fill {{ size }} etc. inside it.
//   <x-icon name="check" class="h-4 w-4" x-show="done"/>
//       becomes an inline SVG line icon (extra attributes are kept).
//
// Dev server: clean URLs (/login -> /login.html), and a full reload when a
// layout or partial changes.
import fs from 'node:fs';
import path from 'node:path';

const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    'shield-check': '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6L12 3z"/><path d="m9 12 2 2 4-4"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.7A8.4 8.4 0 1 1 21 11.5z"/>',
    'map-pin': '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    clipboard: '<rect x="8" y="2.5" width="8" height="4" rx="1"/><path d="M16 4.5h2a2 2 0 0 1 2 2V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    more: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
};

const DIRECTIVE = /^\s*<!--\s*layout:([\s\S]*?)-->/;
const INCLUDE = /<include\s+([^>]*?)>\s*<\/include>/g;
const ICON = /<x-icon\s+([^>]*?)\s*\/?>(?:\s*<\/x-icon>)?/g;
const ATTR = /([^\s=]+)(?:="([^"]*)")?/g;

function parseAttributes(source) {
    const attrs = {};
    for (const [, name, value] of source.matchAll(ATTR)) attrs[name] = value ?? '';
    return attrs;
}

function fill(template, values) {
    return template.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (match, key) => (key in values ? values[key] : match));
}

function renderIcons(html) {
    return html.replace(ICON, (_, attrSource) => {
        const nameMatch = attrSource.match(/(?:^|\s)name="([^"]+)"/);
        const name = nameMatch ? nameMatch[1] : '';
        let rest = attrSource.replace(/(?:^|\s)name="[^"]*"/, '').trim();
        if (!/(^|\s)class="/.test(rest)) rest = `class="h-5 w-5" ${rest}`.trim();
        const body = ICONS[name] ?? '<circle cx="12" cy="12" r="9"/>';
        return `<svg ${rest} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    });
}

export function renderPage(html, srcDir, depth = 0) {
    if (depth > 10) throw new Error('html-templates: include nesting too deep');

    // Layout directive (top-level pages only).
    const directive = depth === 0 ? html.match(DIRECTIVE) : null;
    if (directive) {
        const values = {};
        for (const part of directive[1].split('|')) {
            const [key, ...value] = part.split(':');
            values[key.trim()] = value.join(':').trim();
        }
        const layoutName = values.layout || directive[1].split('|')[0].trim();
        const layout = fs.readFileSync(path.join(srcDir, 'layouts', `${layoutName}.html`), 'utf8');
        const body = html.slice(directive[0].length);
        html = fill(layout, values).replace('<!-- content -->', () => body);
    }

    // Includes (recursive).
    html = html.replace(INCLUDE, (_, attrSource) => {
        const attrs = parseAttributes(attrSource);
        const file = path.join(srcDir, attrs.src);
        const partial = fs.readFileSync(file, 'utf8');
        return renderPage(fill(partial, attrs), srcDir, depth + 1);
    });

    return depth === 0 ? renderIcons(html) : html;
}

export default function htmlTemplates({ srcDir, cleanUrls = [] }) {
    return {
        name: 'planly-html-templates',

        transformIndexHtml: {
            order: 'pre',
            handler: (html) => renderPage(html, srcDir),
        },

        configureServer(server) {
            // Clean URLs like Firebase Hosting's cleanUrls: /login -> /login.html
            server.middlewares.use((req, _res, next) => {
                const [pathname, query] = req.url.split('?');
                if (cleanUrls.includes(pathname)) req.url = `${pathname}.html${query ? `?${query}` : ''}`;
                next();
            });
        },

        handleHotUpdate({ file, server }) {
            if (/[\\/](layouts|partials)[\\/].+\.html$/.test(file)) {
                server.ws.send({ type: 'full-reload' });
                return [];
            }
        },
    };
}
