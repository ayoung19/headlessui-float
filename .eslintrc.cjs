module.exports = {
  extends: '@ycs77',
  rules: {
    // react
    'react/prop-types': 'off',

    // vue
    'vue/no-template-shadow': 'off',
    'vue/no-reserved-component-names': 'off',
    'vue/one-component-per-file': 'off',

    // typescript
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/prefer-ts-expect-error': 'off',
  },
}
