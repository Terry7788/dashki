import type { Config } from 'tailwindcss';
import webConfig from '../web/tailwind.config';

// Same theme as the website; only the files to scan differ.
const config: Config = {
  ...webConfig,
  content: ['./index.html', './src/**/*.{ts,tsx}', '../web/src/**/*.{ts,tsx,mdx}'],
};

export default config;
