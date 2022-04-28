import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smallpearl.appone',
  appName: 'Monorepo AppOne',
  webDir: '../../dist/apps/app-one',
  bundledWebRuntime: false,
  includePlugins: [
    "@capacitor/app",
    "@capacitor/camera",
    "@capacitor/core",
    "@capacitor/haptics",
    "@capacitor/keyboard",
    "@capacitor/status-bar"
  ]
};

export default config;
