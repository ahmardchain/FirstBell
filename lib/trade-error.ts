// Only the provider's bounded numeric threshold crosses into the client. Never
// relay its raw message, which may include request or account context.
export function validUsdMinimum(value: unknown): string | null {
  return typeof value === 'string' && /^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(value)
    && Number(value) > 0 ? value : null
}

export class TradeRequestError extends Error {
  minimumUsd: string | null
  constructor(reason: string, minimumUsd?: unknown) {
    super(reason)
    this.minimumUsd = reason === 'minimum_order_not_met' ? validUsdMinimum(minimumUsd) : null
  }
}
