import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.dailyhabit.app',
  appName: 'Daily Habit',
  webDir: 'docs',
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'https',
    ...(process.env.CAP_LIVERELOAD === '1' && {
      url: 'http://localhost:5173',
      cleartext: true,
    }),
  },
}

export default config
