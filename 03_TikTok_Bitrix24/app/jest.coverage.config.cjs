module.exports = {
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testMatch: ['**/src/**/*.spec.ts', '**/test/**/*.e2e-spec.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { rootDir: '.' } }] },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/disable-external-sync.cjs'],
  globalSetup: '<rootDir>/test/prepare-isolated-db.cjs',
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts', '!src/**/*.module.ts', '!src/**/*.entity.ts'],
  coverageProvider: 'v8',
  coverageReporters: ['text', 'json-summary'],
  coverageDirectory: './coverage',
};
