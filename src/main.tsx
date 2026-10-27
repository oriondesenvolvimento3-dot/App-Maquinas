import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { purgeLegacyMockData } from './lib/dexieDb';

// Limpa qualquer dado mockado legado do IndexedDB na primeira execução
purgeLegacyMockData();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
