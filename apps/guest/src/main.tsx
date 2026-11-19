import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@nookscanner/design-tokens/tokens.css';
import './styles.css';
import { App } from './App.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

createRoot(root).render(
  <StrictMode>
    <App pathname={window.location.pathname} languages={navigator.languages} />
  </StrictMode>,
);
