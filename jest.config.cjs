module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'ts'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(axios)/)'
  ],
  moduleNameMapper: {
    '^@actions/core$': '<rootDir>/node_modules/@actions/core/lib/core.js',
    '^@actions/http-client$': '<rootDir>/node_modules/@actions/http-client/lib/index.js',
    '^@actions/http-client/lib/interfaces$': '<rootDir>/node_modules/@actions/http-client/lib/interfaces.js',
  },
  verbose: true
}
