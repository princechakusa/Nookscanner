import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts (no third-party requests; unicode-range keeps Arabic glyphs lazy).
import '@fontsource-variable/inter/wght.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
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
