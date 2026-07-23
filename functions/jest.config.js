module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/__tests__/**/*.test.ts'],
  // 30s : les tests touchent l'émulateur Firestore (I/O réseau local),
  // plus lent qu'un test unitaire pur.
  testTimeout: 30000,
  // Utilise un tsconfig dédié (types Jest inclus) plutôt que le
  // tsconfig.json principal, qui EXCLUT désormais volontairement
  // src/__tests__ pour ne pas casser `npm run build` (= `tsc`, utilisé
  // par `firebase deploy`) avec des globals describe/test inconnus.
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
};
