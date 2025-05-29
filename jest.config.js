module.exports = {
  // The test environment that will be used for testing
  testEnvironment: 'node',

  // The root directory that Jest should scan for tests and modules
  rootDir: '.',

  // A list of paths to directories that Jest should use to search for files in
  roots: ['<rootDir>/tests/unit', '<rootDir>/tests/integration', '<rootDir>/tests/e2e', '<rootDir>/tests/performance'],

  // The glob patterns Jest uses to detect test files
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],

  // An array of regexp pattern strings that are matched against all test paths
  // matched tests are skipped
  testPathIgnorePatterns: [
    '/node_modules/'
  ],

  // Run with --passWithNoTests to avoid failing when no tests are found
  passWithNoTests: true,

  // Indicates whether each individual test should be reported during the run
  verbose: true,

  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',

  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/'
  ],

  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: [
    'json',
    'text',
    'lcov',
    'clover'
  ],

  // The maximum amount of workers used to run your tests
  maxWorkers: '50%',

  // A map from regular expressions to module names or to arrays of module names
  // that allow to stub out resources with a single module
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },

  // An array of regexp pattern strings that are matched against all modules before they are loaded
  modulePathIgnorePatterns: [],

  // A preset that is used as a base for Jest's configuration
  preset: null,

  // Setting this value to "fake" allows the use of fake timers for functions such as "setTimeout"
  // Setting this value to "modern" allows the use of modern fake timers implementation
  fakeTimers: {
    enableGlobally: true
  },

  // The test timeout in milliseconds
  testTimeout: 30000
};
