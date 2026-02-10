const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    globals: true,
    root: '.',
    include: ['tests/**/*.test.js'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['bin/lib/**/*.js'],
      exclude: ['bin/cli.js', 'bin/verify-diagrams.js', 'bin/context7-setup.js']
    }
  }
});
