import { defineConfig } from 'vite';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'node:url';

// https://vitejs.dev/config
export default defineConfig({
    resolve: {
        alias: {
            '@': resolve(dirname(fileURLToPath(import.meta.url)), 'main'),
        },
    },
});
