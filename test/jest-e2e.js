const { jest: baseConfig } = require('../package.json');

module.exports = {
  moduleFileExtensions: baseConfig.moduleFileExtensions,
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.e2e-spec.ts$',
  transform: baseConfig.transform,
  transformIgnorePatterns: baseConfig.transformIgnorePatterns,
};
