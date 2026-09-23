import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.agrimarche.app',
  appName: 'SunuMenef',
  webDir: 'out',
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: true, // connexion faite dans le SDK web (voir auth/forgot-password)
      providers: ['phone'],
    },
  },
};

export default config;
