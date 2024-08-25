import type { UserConfig } from 'vite'
import { resolve } from 'path'

export default {
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                login: resolve(__dirname, '.templates/login.html'),
                home: resolve(__dirname, '.templates/home.html'),
                register: resolve(__dirname, '.templates/register.html'),
                canvas: resolve(__dirname, '.templates/canvas.html'),
            },
        }
    },
    server: {
        proxy: {
            '/canvas': 'http://localhost:8080',
            '/login': 'http://localhost:8080',
            '/register': 'http://localhost:8080',
            '/home': 'http://localhost:8080',
            '^/$': 'http://localhost:8080',
        }
    }
} satisfies UserConfig