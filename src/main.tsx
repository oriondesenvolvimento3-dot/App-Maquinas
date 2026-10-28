import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { purgeLegacyMockData } from './lib/dexieDb';
import { registerSW } from 'virtual:pwa-register';

// Registro automático do Service Worker para suporte PWA offline e standalone
registerSW({ immediate: true });

// Limpa qualquer dado mockado legado do IndexedDB na primeira execução
purgeLegacyMockData();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
