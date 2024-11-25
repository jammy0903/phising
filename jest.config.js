module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleNameMapper: {
        '^@utils/(.*)$': '<rootDir>/src/utils/$1',
        '^@services/(.*)$': '<rootDir>/src/services/$1',
        '^@pages/(.*)$': '<rootDir>/src/pages/$1',
        '^@styles/(.*)$': '<rootDir>/src/styles/$1'
    },
    moduleFileExtensions: ['js', 'ts', 'tsx'],
    roots: ['<rootDir>/src', '<rootDir>/test'],
    testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
    transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
            tsconfig: 'tsconfig.json'
        }]
    },
    setupFiles: ['<rootDir>/test/setup.ts']
};
