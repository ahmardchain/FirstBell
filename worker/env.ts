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
  PRIVY_VERIFICATION_KEY?: string
  ONDO_API_KEY?: string
  BINANCE_WEB3_API_KEY?: string
  BINANCE_WEB3_SECRET_KEY?: string
  BINANCE_SUPPORT_CAPTURE_UNTIL?: string
  MOONPAY_PUBLISHABLE_KEY?: string
  MOONPAY_SECRET_KEY?: string
  MOONPAY_ENVIRONMENT?: string
}
