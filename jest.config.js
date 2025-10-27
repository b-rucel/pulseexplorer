module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Coverage settings
  collectCoverageFrom: [
    'src/**/*.js',
    'lib/**/*.js',
    '!src/**/*.test.js',
    '!**/node_modules/**',
  ],

  // Coverage thresholds (optional)
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },

  // Test patterns
  testMatch: [
    '**/test/**/*.test.js',
  ],

  // Setup files
  setupFilesAfterEnv: [],

  // Module paths
  moduleDirectories: ['node_modules', 'src'],

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks between tests
  restoreMocks: true,

  // Test timeout (30 seconds for integration tests)
  testTimeout: 30000,
};
