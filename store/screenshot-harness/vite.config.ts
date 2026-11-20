import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url))
  .replace(/\\/g, '/')
  .replace(/\/$/, '');
const repo = path.resolve(here, '../..').replace(/\\/g, '/');
const nm = (p: string) => path.posix.join(here, 'node_modules', p);
const stub = (p: string) => path.posix.join(here, 'stubs', p);

export default defineConfig({
  plugins: [
    {
      name: 'app-lib-stubs',
      enforce: 'pre',
      resolveId(id) {
        if (/lib\/supabase\.ts$/.test(id)) return stub('supabase.ts');
        if (/lib\/uploads\.ts$/.test(id)) return stub('uploads.ts');
        if (/lib\/useQualityTips\.ts$/.test(id)) return stub('useQualityTips.ts');
        return null;
      },
    },
    react(),
  ],
  define: { 'process.env': '{}', __DEV__: 'false', global: 'globalThis' },
  resolve: {
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.mjs', '.json'],
    alias: [
      { find: /^react-native$/, replacement: nm('react-native-web') },
      { find: /^react$/, replacement: nm('react') },
      { find: /^react\/(.*)$/, replacement: nm('react') + '/$1' },
      { find: /^react-dom$/, replacement: nm('react-dom') },
      { find: /^react-dom\/(.*)$/, replacement: nm('react-dom') + '/$1' },
      { find: /^react-native-svg$/, replacement: stub('svg.tsx') },
      { find: /^zod$/, replacement: nm('zod') },
      { find: '@nookscanner/shared', replacement: repo + '/packages/shared/src/index.ts' },
      { find: 'react-native-vision-camera', replacement: stub('vision-camera.tsx') },
      { find: 'react-native-worklets', replacement: stub('empty.ts') },
      { find: 'expo-constants', replacement: stub('expo.ts') },
      { find: 'expo-device', replacement: stub('expo.ts') },
      { find: 'expo-secure-store', replacement: stub('expo.ts') },
      { find: 'expo-file-system', replacement: stub('expo.ts') },
      { find: '@app', replacement: repo + '/apps/nookscanner/src' },
    ],
  },
  optimizeDeps: { include: ['react-native-web', 'react', 'react-dom'] },
  server: { port: 5199, fs: { allow: [here, repo] } },
});
