import {
  DateLocale,
  MixedLocale,
  NumberLocale,
  StringLocale,
} from 'yup/lib/locale'

interface YupLocale {
  mixed: MixedLocale
  string: StringLocale
  number: NumberLocale
  date: DateLocale
}

/** Yup locale object to return error messages as i18n key, or `{key, values} */
export const yupLocale: YupLocale = {
  mixed: {
    default: 'mixed.default',
    required: 'mixed.required',
  },
  string: {
    length: ({ length }) => ({ key: 'string.length', values: { length } }),
    min: ({ min }) => ({ key: 'string.min', values: { min } }),
    max: ({ max }) => ({ key: 'string.max', values: { max } }),
    matches: 'string.matches',
    email: 'string.email',
    url: 'string.url',
    uuid: 'string.uuid',
    trim: 'string.trim',
    lowercase: 'string.lowercase',
    uppercase: 'string.uppercase',
  },
  number: {
    min: ({ min }) => ({ key: 'number.min', values: { min } }),
    max: ({ max }) => ({ key: 'number.max', values: { max } }),
    lessThan: ({ less }) => ({ key: 'number.lessThan', values: { less } }),
    moreThan: ({ more }) => ({ key: 'number.moreThan', values: { more } }),
    positive: ({ more }) => ({ key: 'number.positive', values: { more } }),
    negative: ({ less }) => ({ key: 'number.negative', values: { less } }),
    integer: 'number.integer',
  },
  date: {
    min: ({ min }) => ({ key: 'date.min', values: { min } }),
    max: ({ max }) => ({ key: 'date.max', values: { max } }),
  },
}
