import { integrationTest } from '.'

test('Integration test', async () => {
  const result = await integrationTest()
  return expect(result).toBe(undefined)
})
