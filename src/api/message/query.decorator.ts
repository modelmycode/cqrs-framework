import 'reflect-metadata'

import { MessageAccess, messageAccess } from './message-access'
import { messageNames } from './message-names'

export function query(
  name: string,
  access?: MessageAccess | null,
): ClassDecorator {
  return (target) => {
    messageNames.set(target, name)

    if (access) {
      messageAccess.set(name, access)
    }
  }
}
