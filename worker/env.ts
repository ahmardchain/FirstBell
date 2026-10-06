export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
}

export interface AccountNamespace {
  idFromName(name: string): string
  get(name: string): { fetch(request: Request): Promise<Response> }
}

export interface ApiEnv {
  ACCOUNTS: AccountNamespace
  PRIVY_APP_ID: string
  PRIVY_APP_SECRET?: string
  PRIVY_VERIFICATION_KEY?: string
  ONDO_API_KEY?: string
  BINANCE_WEB3_API_KEY?: string
  BINANCE_WEB3_SECRET_KEY?: string
  MEGAFUEL_API_KEY?: string
  MEGAFUEL_POLICY_UUID?: string
  MOONPAY_PUBLISHABLE_KEY?: string
  MOONPAY_SECRET_KEY?: string
  MOONPAY_ENVIRONMENT?: string
  CARD_FUNDING_PROVIDER?: string
  ONRAMPER_API_KEY?: string
  ONRAMPER_SIGNING_PRIVATE_KEY?: string
  ONRAMPER_WEBHOOK_SECRET?: string
  ONRAMPER_ENVIRONMENT?: string
  ONRAMPER_BSC_USDT_ID?: string
}
