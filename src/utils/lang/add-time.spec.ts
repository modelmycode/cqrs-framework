import { timestampAdding } from './add-time'

describe('lang-utils', () => {
  it('timestampAdding()', () => {
    expect(timestampAdding(10, 10)).toBe(20)
    expect(timestampAdding({ milliseconds: 10 }, 10)).toBe(20)
    expect(timestampAdding({ milliseconds: -10 }, 10)).toBe(0)

    expect(timestampAdding({ milliseconds: 10, seconds: 10 }, 10)).toBe(10_020)
    expect(timestampAdding({ milliseconds: 10, seconds: 10 }, 10)).toBe(10_020)
    expect(
      timestampAdding({ milliseconds: 10, seconds: 10, minutes: 1 }, 10),
    ).toBe(70_020)
    expect(timestampAdding({ milliseconds: 10, hours: 1 }, 10)).toBe(3600_020)
    expect(timestampAdding({ milliseconds: 10, days: 2 }, 10)).toBe(
      2 * 24 * 3600_000 + 20,
    )
  })
})
