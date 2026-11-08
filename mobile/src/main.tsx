import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './fold.css';
import { checkForUpdate } from './lib/updater';
import { initHealthSync } from './lib/health';

document.documentElement.classList.add('dark');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

checkForUpdate('dashki');
initHealthSync();
