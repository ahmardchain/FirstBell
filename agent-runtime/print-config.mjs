import { fileURLToPath } from 'node:url'
console.log(JSON.stringify({ mcpServers: { firstbellBinance: { command: process.execPath, args: [fileURLToPath(new URL('./server.mjs', import.meta.url))] } } }, null, 2))
