import 'reflect-metadata'

/* eslint-disable @typescript-eslint/ban-types */

export function reflectParamTypes(
  target: Object,
  propertyKey: string | symbol,
) {
  return Reflect.getMetadata('design:paramtypes', target, propertyKey)
}
