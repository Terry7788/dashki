import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { checkForUpdate } from './lib/updater';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

checkForUpdate('dashki');
