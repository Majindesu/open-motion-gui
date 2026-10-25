import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import DenyMobile, { useIsDesktop } from './layout/DenyMobile';

const isRenderer = location.pathname === '/renderer';

const Editor = lazy(async () => {
  const [{ default: EditorShell }, { hydrate, startAutosave }] = await Promise.all([
    import('./components/EditorShell'), import('./services/Persist'),
  ]);
  await hydrate();      // restore the last session from IndexedDB before the first render
  startAutosave();      // only start saving after hydration, so we never overwrite it with the demo
  return { default: EditorShell };
});

function EditorApp() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <DenyMobile />;
  return (
    <Suspense fallback={<div className="h-full bg-[#1E1E1E]" />}>
      <Editor />
    </Suspense>
  );
}

async function boot() {
  // The editor and the canvas get different stylesheets, and the iframe skips loading the editor code entirely.
  await (isRenderer ? import('./renderer.css') : import('./index.css'));
  const root = createRoot(document.getElementById('root')!);

  if (isRenderer) {
    const { default: Renderer } = await import('./components/Renderer');
    root.render(<StrictMode><Renderer /></StrictMode>);
    return;
  }
  root.render(<StrictMode><EditorApp /></StrictMode>);
}

boot();