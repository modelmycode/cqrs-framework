import 'reflect-metadata'

import { reflectParamTypes } from './refect-utils'

type MessageName = string
type MethodName = string

export type HandlersInType = Record<MessageName, MethodName>

export function handlerMethodDecorator<T = unknown>(
  metadataKey: any,
  typeName?: string | string[],
): MethodDecorator {
  return (target, propertyKey) => {
    let typeNames: string[]
    if (typeName) {
      typeNames = Array.isArray(typeName) ? typeName : [typeName]
    } else {
       const reflectedName = target ? reflectParamTypes(target, propertyKey) : ''
      if (!reflectedName) {
        throw   new Error(
          `Missing type on ${target.constructor.name}.${String(propertyKey)}()`,
        )
      }
      if (reflectedName === 'Object') {
        throw new Error(
          `Wrong type on ${target.constructor.name}.${String(propertyKey)}()`,
        )
      }
      typeNames = [reflectedName]
    }

    for (const name of typeNames) {
      const metadata = Reflect.getMetadata(metadataKey, target) || {}
      if (metadata[name]) {
        throw new Error(
          `Duplicated handler for ${name} on ${target.constructor.name}`,
        )
      }
      metadata[name] = propertyKey

      Reflect.defineMetadata(metadataKey, metadata, target)
    }
  }
}
