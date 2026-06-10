import tseslint from 'typescript-eslint'

export default tseslint.config(...tseslint.configs.recommended, {
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    // Enforce `import type` for type-only imports.
    // Prevents accidental value imports of @argos/shared (devDependency —
    // not bundled in the distributed CLI; value imports cause runtime crashes).
    '@typescript-eslint/consistent-type-imports': [
      'error',
      { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
    ],
    // Block VALUE imports from @argos/shared — type imports are fine.
    // @argos/shared is a devDependency not bundled in the distributed CLI;
    // value imports cause runtime crashes in production.
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@argos/shared',
            allowTypeImports: true,
            message:
              'Use "import type" from @argos/shared — it is a devDependency not bundled in the CLI.',
          },
        ],
      },
    ],
  },
})
