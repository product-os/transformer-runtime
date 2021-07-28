import { integrationTest } from '.'

test('Integration test', () => {
  expect(integrationTest()).resolves.toBe(undefined)
})
