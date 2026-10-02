import { createVercelHandler } from '../server/vercel.ts'

export default { fetch: createVercelHandler() }
