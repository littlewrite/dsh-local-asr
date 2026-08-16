import { defineConfig } from 'tsdown'

const platformExternal = [/^@deepseek-ai\//, /^react(?:\/|$)/]

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    outDir: 'lib',
    outExtensions: () => ({ js: '.js' }),
    external: platformExternal,
  },
  {
    entry: { client: 'src/client.ts' },
    format: ['cjs'],
    platform: 'browser',
    dts: false,
    outDir: 'lib',
    outExtensions: () => ({ js: '.js' }),
    external: platformExternal,
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-local-asr", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
