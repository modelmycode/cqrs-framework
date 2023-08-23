export const validationI18nNS = 'validation'

export type ValidationI18nMessage =
  | string // key
  | { key: string; values: Record<string, any> }
