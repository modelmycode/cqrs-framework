import { deserializeObject, serializeObject } from './axon-serialization'

describe('axon-serialization', () => {
  it('serializeObject() and deserializeObject()', () => {
    class TestObject {
      constructor(public value: number) {}
    }
    const instance = new TestObject(10)
    const serialized = serializeObject(instance)
    expect(serialized.getType()).toBe('TestObject')

    const deserialized = deserializeObject(serialized)
    expect((deserialized as TestObject).value).toBe(10)
  })

  it('ignore mock constructor', () => {
    const serialized = serializeObject({
      value: 10,
      constructor: { name: 'TestObject' },
    })
    expect(serialized.getType()).toBe('TestObject')
    expect(deserializeObject(serialized)).toEqual({ value: 10 })
  })
})
