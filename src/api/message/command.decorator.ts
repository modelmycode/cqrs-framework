import 'reflect-metadata'

import { AnySchema } from 'yup'

import { commandSchemas } from './command-schemas'
import { MessageAccess, messageAccess } from './message-access'
import { messageNames } from './message-names'

export function command(
  name: string,
  validation?: MessageAccess & { schema?: AnySchema | (() => AnySchema) },
): ClassDecorator {
  return (target) => {
    messageNames.set(target, name)

    if (validation) {
      const { schema, ...access } = validation
      if (schema) {
        commandSchemas.set(name, schema)
      }
      if (Object.keys(access).length > 0) {
        messageAccess.set(name, access)
      }
    }
  }
}
