/// <reference types="vitest" />
import path from 'path';
import packageJson from './package.json';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'lib/index.ts'),
      name: packageJson.name,
    },
    minify: false,
  },
  define: {
    'import.meta.vitest': 'undefined',
  },
  plugins: [
    dts({
      exclude: [
        '**/node_modules',
        '**/*.test.ts'
      ]
    })
  ],
  test: {
    environment: 'happy-dom',
    includeSource: ['lib/**/*.{js,ts}'],
    coverage: {
      enabled: true,
      reporter: ['text', 'json-summary', 'json'],
      reportOnFailure: true,
      include: ['lib/**']
    }
  }
});
