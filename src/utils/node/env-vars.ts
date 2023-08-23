import {objectKeys} from '../lang'
import * as dotenv from 'dotenv'

/**
 * Define Environment Variables and default values.
 *
 * @param vars An object define the variable keys and default values
 * @param production Production values required unless in `defaults`
 * @param onError
 */
export function envVars<T extends Record<string, string | number | boolean>>(
  vars: T,
  production?: boolean | { defaults: Partial<T> },
  onError?: (errors: string[]) => void,
): T {
  dotenv.config()

  const errors: string[] = []
  for (const key of objectKeys(vars)) {
    const defaultValue = vars[key]
    const envValue = process.env[key as string]

    // -- Validate missing value in production
    if (!envValue) {
      if (production && production !== true && key in production.defaults) {
        Object.assign(vars, {[key]: production.defaults[key]})
        continue // Use production default value
      }

      if (!production && defaultValue !== '') continue // Use local default value

      errors.push(`Environment Variable ${String(key)} is not set`) // Missing value
      continue
    }

    // -- Validate types
    const varType = typeof defaultValue
    const markInvalidType = () =>
      errors.push(`Environment Variable ${String(String(key))} (${varType}) get '${envValue}'`)

    if (varType === 'string') {
      Object.assign(vars, {[key]: envValue})
    } else if (varType === 'number') {
      if (/^\d+$/.test(envValue)) {
        Object.assign(vars, {[key]: +envValue})
      } else {
        markInvalidType()
      }
    } else if (varType === 'boolean') {
      if (envValue === 'true') {
        Object.assign(vars, {[key]: true})
      } else if (envValue === 'false') {
        Object.assign(vars, {[key]: false})
      } else {
        markInvalidType()
      }
    } else {
      markInvalidType()
    }
  }

  if (errors.length > 0) {
    onError?.(errors)
    throw new Error(errors.join('\n'))
  }

  return vars
}
