import { SerializedObject } from 'axon-server-node-api'
import {messageNames} from "../api/message/message-names";
import {clearBuildMessage} from "../api/message/message-utils";

// eslint-disable-next-line @typescript-eslint/ban-types
export function serializeObject<T extends object>(
  object: T,
  type?: string,
): SerializedObject {
  return new SerializedObject()
    .setType(
      type || messageNames.get(object.constructor) || object.constructor.name,
    )
    .setData(Buffer.from(JSON.stringify(clearBuildMessage(object))))
}

export function deserializeObject(object: SerializedObject) {
  return JSON.parse(
    new TextDecoder('utf-8').decode(object.getData() as Uint8Array),
  )
}
