import { copyFile, cp } from 'node:fs/promises'

// Runs after the root build when Vercel's Root Directory is server-test.
// Keep the original protected comparison page available separately.
await copyFile(new URL('../server-test/public/index.html', import.meta.url), new URL('../server-test/public/server-test.html', import.meta.url))
await cp(new URL('../dist/', import.meta.url), new URL('../server-test/public/', import.meta.url), { recursive: true })
