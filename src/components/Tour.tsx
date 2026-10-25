import { useEffect, useState } from 'react';
import { Joyride, STATUS, type Step } from 'react-joyride';

const KEY = 'gsap-builder:tour-done';
export const TOUR_EVENT = 'gsap-builder:start-tour';

// Target ids come from the layout in EditorShell / Workspace / Inspector / BottomTimeline.
const steps: Step[] = [
  {
    target: 'body',
    placement: 'center',
    title: 'Welcome to GSAP Builder',
    content: 'Build responsive layouts visually and animate them with GSAP. Everything runs locally in your browser and autosaves as you work. This quick tour covers the four main areas.',
  },
  {
    target: '#left-sidebar',
    placement: 'right',
    title: 'Library & Layers',
    content: 'Add containers, text, images and SVGs from the Library, by clicking or dragging onto a layer. In Layers, drag to reorder, nest into a container, or change stacking order. The top of the list is in front.',
  },
  {
    target: '#canvas-iframe',
    placement: 'auto',
    title: 'Canvas',
    content: 'Your page renders here in its own isolated frame, so zooming the editor never breaks scroll animations. Click any element to select it.',
  },
  {
    target: '#inspector-panel',
    placement: 'left',
    title: 'Inspector',
    content: 'The Design tab controls layout, spacing and color. The Animate tab adds GSAP tweens, and only offers effects that are safe for the selected element type.',
  },
  {
    target: '#timeline-panel',
    placement: 'top',
    title: 'Timeline',
    content: 'TIME mode shows tweens in seconds: drag blocks to retime them and scrub the playhead. SCROLL mode shows scroll-driven animations as a percentage of the page. Use Export Code in the top bar to get a runnable Vite project.',
  },
];

const alreadyDone = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const markDone = () => { try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked: tour may show again */ } };

export default function Tour() {
  const [run, setRun] = useState(() => !alreadyDone());
  const [nonce, setNonce] = useState(0); // remounting is the reliable way to restart a finished tour

  useEffect(() => {
    const restart = () => { setNonce(n => n + 1); setRun(true); };
    window.addEventListener(TOUR_EVENT, restart);
    return () => window.removeEventListener(TOUR_EVENT, restart);
  }, []);

  return (
    <Joyride
      key={nonce}
      run={run}
      steps={steps}
      continuous
      onEvent={data => {
        if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
          setRun(false);
          markDone();
        }
      }}
      options={{
        skipBeacon: true,                       // open tooltips directly, no pulsing beacon
        buttons: ['back', 'skip', 'primary'],   // let people bail out at any step
        showProgress: true,
        primaryColor: '#3b82f6',
        backgroundColor: '#2A2A2A',
        textColor: '#e5e5e5',
        arrowColor: '#2A2A2A',
        overlayColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: 10000,
      }}
    />
  );
}