import { Type } from './lang'

export class TypeInstanceMap {
  private readonly map = new Map<Type, any>()

  public get<T>(type: Type<T>): T {
    let instance = this.map.get(type)
    if (!instance) {
      instance = new type()
      this.map.set(type, instance)
    }
    return instance
  }
}
