import { objectKeys } from './object-keys'

describe('objectKeys()', () => {
  it('should return strong typed keys', () => {
    const obj = { a: 1, b: 2 }
    expect(objectKeys(obj).map((k) => obj[k])).toEqual([1, 2])
  })
})
