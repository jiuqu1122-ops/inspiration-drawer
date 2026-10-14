import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'src-tauri/**', 'node_modules/**', 'release-assets/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // Existing controller scopes intentionally contain dynamic records.
      '@typescript-eslint/no-explicit-any': 'off',
      // TypeScript noUnusedLocals/noUnusedParameters own these diagnostics.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-empty': 'off',
      // Generated controller wrappers deliberately destructure an empty scope.
      'no-empty-pattern': 'off',
      // Existing style debt stays visible without blocking this initial lint setup.
      'no-useless-escape': 'warn',
      'prefer-const': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-control-regex': 'warn',
      'no-extra-boolean-cast': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
    },
  },
);
