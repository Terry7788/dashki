import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dashki.app',
  appName: 'Dashki',
  webDir: 'dist',
  // For dev: point at the Vite dev server on the LAN. Comment out for prod builds.
  // Uncomment the `server` block below when testing on a real device against local backend.
  // server: {
  //   url: 'http://192.168.0.36:5173',
  //   cleartext: true,
  // },
  ios: {
    contentInset: 'always', // respects iPhone notch / dynamic island
    backgroundColor: '#1a1918', // matches dark theme so launch-to-app transition is seamless
  },
  android: {
    backgroundColor: '#1a1918',
    allowMixedContent: false, // prod: HTTPS only
  },
  plugins: {
    // Plugin configuration will be filled in by DSHKI-48+ tickets
    // (camera for label scan, push notifications, splash screen, etc.)
  },
};

export default config;
