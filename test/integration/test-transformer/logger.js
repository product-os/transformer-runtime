/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

module.exports = {
  log: (...arg) => {
    console.log('[TEST TRANSFORMER]', ...arg)
  },
  info: (...arg) => {
    console.log('[TEST TRANSFORMER]', ...arg)
  },
  warn: (...arg) => {
    console.warn('[TEST TRANSFORMER]', ...arg)
  },
  error: (...arg) => {
    console.error('[TEST TRANSFORMER]', ...arg)
  },
}
