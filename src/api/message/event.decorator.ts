import 'reflect-metadata'
import {messageNames} from "./message-names";


export function event(
  name: string,
): ClassDecorator {
  return (target) => {
    messageNames.set(target, name)
  }
}