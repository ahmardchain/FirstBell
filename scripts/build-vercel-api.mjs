import { fileURLToPath } from 'node:url'
import { copyFile } from 'node:fs/promises'
import { build } from 'vite'

// Commit the generated entry as well: Vercel discovers /api functions before
// the frontend build. A single ESM file avoids tracing TypeScript imports.
await build({
  configFile: false,
  publicDir: false,
  ssr: { noExternal: true },
  build: {
    ssr: fileURLToPath(new URL('../server/entry.ts', import.meta.url)),
    outDir: fileURLToPath(new URL('../api', import.meta.url)),
    emptyOutDir: false,
    target: 'node24',
    minify: false,
    sourcemap: false,
    rollupOptions: { output: { entryFileNames: 'index.mjs', inlineDynamicImports: true } },
  },
})

// The existing diagnostic project can deploy the full app from its current
// Root Directory, retaining its server environment without moving credentials.
await copyFile(new URL('../api/index.mjs', import.meta.url), new URL('../server-test/api/index.mjs', import.meta.url))
