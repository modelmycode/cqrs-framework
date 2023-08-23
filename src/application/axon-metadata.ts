import { MetaDataValue } from 'axon-server-node-api'

export interface AxonMetadata {
  [key: string]: string | number | boolean | undefined
}

export function axonMetadataValue(metadata: AxonMetadata, key: string) {
  const value = metadata[key]
  switch (typeof value) {
    case 'boolean':
      return new MetaDataValue().setBooleanValue(value)
    case 'number':
      return new MetaDataValue().setNumberValue(value)
    case 'string':
      return new MetaDataValue().setTextValue(value)
    default:
      return new MetaDataValue()
  }
}

export function getAxonMetadataValue(v: MetaDataValue) {
  switch (v.getDataCase()) {
    case MetaDataValue.DataCase.TEXT_VALUE:
      return v.getTextValue()
    case MetaDataValue.DataCase.NUMBER_VALUE:
      return v.getNumberValue()
    case MetaDataValue.DataCase.DOUBLE_VALUE:
      return v.getDoubleValue()
    case MetaDataValue.DataCase.BOOLEAN_VALUE:
      return v.getBooleanValue()
    default:
      return undefined
  }
}
