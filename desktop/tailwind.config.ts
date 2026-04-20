import type { Config } from 'tailwindcss';
import webConfig from '../web/tailwind.config';

const config: Config = {
  ...webConfig,
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../web/src/**/*.{ts,tsx}',
  ],
};

export default config;
