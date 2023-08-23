interface ConversionOptions {
  locale?: string
  decimals?: number
  noCommas?: boolean
}

export const unitAmountToCurrency = (
  value: string | number,
  currency: string,
  options: ConversionOptions = {},
) => {
  const decimals = options?.decimals ?? 0
  const locale = options?.locale ?? 'en-US'
  const parsed = parseInt(String(value), 10) / 100

  const result = parsed
    .toLocaleString(locale, {
      style: 'currency',
      currency: currency?.toUpperCase(),
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    .replace(/[a-zA-Z]/g, '')
    .trim()

  if (options.noCommas) {
    return result.replace(/,/g, '')
  }

  return result
}
