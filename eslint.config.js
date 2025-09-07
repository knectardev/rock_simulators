export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly"
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: true
    },
    rules: {
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": ["error", { destructuring: "all" }],
      "no-unused-vars": ["error", { args: "after-used", argsIgnorePattern: "^_" }],
      "no-constant-binary-expression": "error",
      "no-unreachable-loop": "error"
    }
  }
];


