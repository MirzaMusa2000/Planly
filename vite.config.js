import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import htmlTemplates from './build/html-templates.js';

const src = resolve(import.meta.dirname, 'src');

// One HTML entry per page; Firebase Hosting serves them with clean URLs.
const pages = ['index', 'login', 'pending', 'itinerary', 'members', '404'];

export default defineConfig({
    root: src,
    envDir: import.meta.dirname, // .env stays in the project root
    publicDir: resolve(src, 'public'),
    plugins: [
        htmlTemplates({ srcDir: src, cleanUrls: ['/login', '/pending', '/itinerary', '/members'] }),
        tailwindcss(),
    ],
    build: {
        outDir: resolve(import.meta.dirname, 'dist'),
        emptyOutDir: true,
        // The Firebase chunk alone is ~530 kB (~160 kB gzipped).
        chunkSizeWarningLimit: 600,
        rollupOptions: {
            input: Object.fromEntries(pages.map((p) => [p, resolve(src, `${p}.html`)])),
            output: {
                // Keep the (large, rarely changing) Firebase SDK in its own
                // long-cached chunk, separate from app code.
                manualChunks: {
                    firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
                },
            },
        },
    },
    // Pre-bundle lazily imported deps so the dev server doesn't discover them
    // mid-session and force a full page reload.
    optimizeDeps: {
        include: ['@fullcalendar/core', '@fullcalendar/daygrid', '@fullcalendar/list', '@fullcalendar/interaction'],
    },
    server: {
        port: 5173,
        strictPort: true,
    },
});
