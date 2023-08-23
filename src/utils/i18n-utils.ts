import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

import i18next, { i18n as I18n, InitOptions, Resource } from 'i18next'

export async function loadAllResources(
  i18n: I18n | ((options: InitOptions) => Promise<I18n>) = i18next,
): Promise<I18n> {
  const localesDir = 'libs/i18n/l10n/locales'

  const locales = new Set<string>()
  const namespaces = new Set<string>()
  const resources: Resource = readdirSync(localesDir).reduce(
    (result, locale) =>
      Object.assign(result, {
        [locale]: readdirSync(join(localesDir, locale)).reduce((ns, file) => {
          const fileMatch = file.match(/^(.*)\.json$/)
          if (fileMatch) {
            const name = fileMatch[1]
            Object.assign(ns, {
              [name]: JSON.parse(
                readFileSync(join(localesDir, locale, file), 'utf8'),
              ),
            })

            namespaces.add(name)
            locales.add(locale)
          }
          return ns
        }, {}),
      }),
    {},
  )

  const options: InitOptions = {
    supportedLngs: Array.from(locales),
    fallbackLng: 'en-NZ',
    resources,
  }
  if (typeof i18n === 'function') {
    return i18n(options)
  } else {
    await i18n.init(options)
    return i18n
  }
}
