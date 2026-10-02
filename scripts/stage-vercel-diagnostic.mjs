import { copyFile } from 'node:fs/promises'

// The repository-root Vercel build also retains the private comparison UI.
for (const [source, destination] of [
  ['index.html', 'server-test.html'],
  ['style.css', 'style.css'],
  ['test.js', 'test.js'],
]) {
  await copyFile(new URL(`../server-test/public/${source}`, import.meta.url), new URL(`../dist/${destination}`, import.meta.url))
}
