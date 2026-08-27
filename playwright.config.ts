import { defineConfig, devices } from 'playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 로컬 워커 무제한(undefined = CPU 코어수)은 35테스트 x 2프로젝트에서 브라우저를
  // 코어수만큼 동시에 띄워 CPU를 포화시킨다 (dev 서버까지 겹침). 4면 5분 내 완주한다.
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
