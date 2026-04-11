import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextCoreWebVitals,
  {
    ignores: ['coverage/**', 'playwright-report/**', 'test-results/**']
  },
  {
    rules: {
      'react/no-unescaped-entities': 'off'
    }
  }
];

export default config;
