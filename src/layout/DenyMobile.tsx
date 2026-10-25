import { useSyncExternalStore } from 'react';

// Desktop = wide enough for the three-panel layout AND a mouse/trackpad as the primary pointer.
// (Touch-only tablets are blocked even in landscape; touchscreen laptops pass, since their primary pointer is fine.)
const QUERIES = ['(min-width: 1024px)', '(pointer: fine)'];

export function useIsDesktop() {
  return useSyncExternalStore(
    notify => {
      const lists = QUERIES.map(q => matchMedia(q));
      lists.forEach(l => l.addEventListener('change', notify));
      return () => lists.forEach(l => l.removeEventListener('change', notify));
    },
    () => QUERIES.every(q => matchMedia(q).matches),
    () => true,
  );
}

export default function DenyMobile() {
  const hasMouse = matchMedia('(pointer: fine)').matches; // desktop browser, just too narrow
  return (
    <main className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center bg-[#1E1E1E] text-neutral-200">
      <div className="text-5xl" aria-hidden>🖥️</div>
      <h1 className="text-xl font-semibold max-w-md">Please use your Desktop/Laptop PC to access the editor</h1>
      {hasMouse && <p className="text-sm text-neutral-500 max-w-sm">Or make your browser window at least 1024px wide.</p>}
    </main>
  );
}