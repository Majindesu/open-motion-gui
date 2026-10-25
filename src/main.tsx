import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const isRenderer = location.pathname === '/renderer';

async function boot() {
  // The editor and the canvas get different stylesheets, and the iframe skips loading the editor code entirely.
  await (isRenderer ? import('./styles/renderer.css') : import('./index.css'));
  const root = createRoot(document.getElementById('root')!);

  if (isRenderer) {
    const { default: Renderer } = await import('./components/Renderer');
    root.render(<StrictMode><Renderer /></StrictMode>);
    return;
  }

  const [{ default: EditorShell }, { hydrate, startAutosave }] = await Promise.all([
    import('./components/EditorShell'), import('./services/Persist'),
  ]);
  await hydrate();      // restore the last session from IndexedDB before the first render
  startAutosave();      // only start saving after hydration, so we never overwrite it with the demo
  root.render(<StrictMode><EditorShell /></StrictMode>);
}

boot();