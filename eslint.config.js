import { GLOB_MARKDOWN_CODE, GLOB_TS } from '@antfu/eslint-config'
import { defineConfig } from '@moeru/eslint-config'

export default defineConfig({
}, {
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
}, {
  files: [GLOB_TS],
  rules: {
    'ts/no-unsafe-assignment': 'warn',
    'ts/no-unsafe-call': 'warn',
    'ts/no-unsafe-member-access': 'warn',
    'ts/no-unsafe-return': 'warn',
  },
}, {
  ignores: [
    '.github',
  ],
})
