import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.leunos.lwrite',
  appName: 'LWrite',
  webDir: 'dist',
  // This origin owns the IndexedDB library. Never change it between releases.
  server: { hostname: 'localhost', androidScheme: 'https' },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
    minWebViewVersion: 111,
  },
  loggingBehavior: 'debug',
  plugins: {
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
  },
};

export default config;
