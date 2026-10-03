import { generateKeyPairSync } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const mode = process.argv[2]
if (!['sandbox', 'live'].includes(mode)) throw new Error('Usage: node scripts/onramper-keys.mjs sandbox|live')
const directory = join(homedir(), '.config', 'firstbell', 'onramper', mode)
mkdirSync(directory, { recursive: true, mode: 0o700 })
const pair = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
// Never overwrite an active key or print its private material.
writeFileSync(join(directory, 'private.pem'), pair.privateKey, { mode: 0o600, flag: 'wx' })
writeFileSync(join(directory, 'public.pem'), pair.publicKey, { mode: 0o600, flag: 'wx' })
console.log(`Private key saved at ${join(directory, 'private.pem')}. Paste its contents into the server's ONRAMPER_SIGNING_PRIVATE_KEY secret.`)
console.log('Send only this public key to Onramper for registration against the matching API key:')
console.log(pair.publicKey)
