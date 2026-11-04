import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: './server/test/global-setup.ts',
    fileParallelism: false, // one shared test database
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://nashr:nashr@localhost:5432/nashr_test' },
  },
})
