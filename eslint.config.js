import { GLOB_MARKDOWN_CODE } from '@antfu/eslint-config'
import { defineConfig } from '@moeru/eslint-config'

export default defineConfig({}, {
  rules: {
    'prefer-arrow/prefer-arrow-functions': 'off',
  },
}, {
  files: ['examples/**', 'playground/**'],
  rules: {
    '@masknet/no-top-level': 'off',
    'antfu/no-top-level-await': 'off',
    'no-console': 'off',
  },
}, {
  files: [GLOB_MARKDOWN_CODE],
  rules: {
    'sonarjs/unused-import': 'off',
  },
})
