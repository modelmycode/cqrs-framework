export function errorCode(
  ns: string,
  key: string,
  side: 'client' | 'server' = 'client',
) {
  if (!/Error$/.test(ns)) {
    ns = ns + 'Error'
  }
  return `${ns}:${side}.${key}`
}
