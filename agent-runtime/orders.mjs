import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export function createOrderJournal(directory = process.env.FIRSTBELL_AGENT_DATA_DIR || join(homedir(), '.firstbell-binance')) {
  const file = join(directory, 'orders.json')
  let queue = Promise.resolve()
  const read = async () => {
    try {
      const value = JSON.parse(await readFile(file, 'utf8'))
      if (!value || value.version !== 1 || !Array.isArray(value.orders) || value.orders.length > 256) throw new Error('invalid_order_journal')
      return value.orders
    } catch (error) { if (error.code === 'ENOENT') return []; throw error }
  }
  const write = async rows => {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const temporary = join(directory, `orders-${randomUUID()}.tmp`)
    await writeFile(temporary, JSON.stringify({ version: 1, orders: rows }), { mode: 0o600 })
    await rename(temporary, file)
  }
  return {
    get: async id => (await read()).find(row => row.reviewId === id) ?? null,
    list: read,
    save: row => {
      const next = queue.then(async () => {
        const rows = await read(), existing = rows.findIndex(r => r.reviewId === row.reviewId)
        if (existing < 0 && rows.length >= 256) throw new Error('order_journal_full')
        if (existing < 0) rows.push(row); else rows[existing] = row
        await write(rows)
      })
      queue = next.catch(() => {}); return next
    },
  }
}
