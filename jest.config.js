const base = require("@balena/jellyfish-config/config/jest.config")

module.exports = {
  ...base,
  testTimeout: 30000,
}
