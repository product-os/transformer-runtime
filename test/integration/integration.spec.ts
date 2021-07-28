import { syncIntegrationScenario } from '@balena/jellyfish-test-harness'
import { integrationTest } from '.'

test('Integration test', () => {
  expect(integrationTest()).resolves.toBe(undefined)
})
