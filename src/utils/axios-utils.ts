import { AxiosError } from 'axios'

export function isAxiosError(err: unknown): err is AxiosError {
  return (err as AxiosError)?.isAxiosError
}
