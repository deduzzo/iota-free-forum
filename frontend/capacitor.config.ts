import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.iotapolis.app',
  appName: 'IotaPolis',
  webDir: 'dist',
  server: {
    // In dev, proxy to the Vite dev server
    // url: 'http://localhost:5173',
    // cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0a0a1a',
      showSpinner: false,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#0a0a1a',
    },
  },
};

export default config;
