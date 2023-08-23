export interface ErrorResponse<TData = unknown> {
  /** Format `{namespace}Error:[client|server].{name}` */
  code: string
  /** Error message for dev/debug/logging */
  message?: string
  /** Extra data for clients */
  data?: TData

  /** (Translated) Message ƒor showing to user. */
  userMessage?: string
}
