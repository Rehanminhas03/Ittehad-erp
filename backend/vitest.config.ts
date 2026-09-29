import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

const testEnv = config({ path: '.env.test', quiet: true }).parsed ?? {};

export default defineConfig({
  test: {
    env: { ...testEnv, DOTENV_PATH: '.env.test' },
    globalSetup: ['test/globalSetup.ts'],
    // One shared Postgres test database; files run sequentially and reset data per test.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 180_000,
  },
});
