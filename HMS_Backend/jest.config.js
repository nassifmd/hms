module.exports = {
  testEnvironment: "node",
  testMatch: ["**/src/tests/**/*.test.js"],
  testTimeout: 30000,
  setupFiles: ["./jest.setup.js"],
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/tests/**",
    "!src/docs/**",
    "!src/templates/**"
  ],
};
