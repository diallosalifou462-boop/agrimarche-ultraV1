import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.agrimarche.app',
  appName: 'AgriMarché',
  webDir: 'out',
  server: {
    url: 'https://agrimarche-ultra-v1.vercel.app',
    cleartext: true
  }
};

export default config;