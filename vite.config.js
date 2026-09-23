import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.js'],
            refresh: true,
        }),
        tailwindcss(),
    ],
    build: {
        // The Firebase chunk alone is ~530 kB (~160 kB gzipped).
        chunkSizeWarningLimit: 600,
        rollupOptions: {
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
        include: [
            '@fullcalendar/core',
            '@fullcalendar/daygrid',
            '@fullcalendar/list',
            '@fullcalendar/interaction',
        ],
    },
    server: {
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});
