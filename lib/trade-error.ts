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

// Trade and Agent describe the same fixed failures; provider text stays private.
export const routeFailureMessages = {
  en: {
    no_verified_route: 'No quote is available for this token and amount right now.',
    liquidity_unavailable: 'The provider has no liquidity for this token and amount right now.',
    token_unavailable: 'The provider does not support this token.',
    unsupported_execution_mode: 'Trading on this token’s swap route is not enabled in FirstBell yet.',
    unsupported_route_vendor: 'The available trading route is not enabled in FirstBell yet.',
    invalid_provider_response: 'The quote could not be validated. Get a fresh quote.',
  },
  zh: {
    no_verified_route: '此代币和金额当前暂无报价。',
    liquidity_unavailable: '服务商当前无法为此代币和金额提供流动性。',
    token_unavailable: '服务商不支持此代币。',
    unsupported_execution_mode: 'FirstBell 尚未启用此代币的兑换路线。',
    unsupported_route_vendor: 'FirstBell 尚未启用当前可用的交易路线。',
    invalid_provider_response: '无法核实报价，请获取新报价。',
  },
} as const
