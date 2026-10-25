import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Renderer from './components/Renderer';
import EditorShell from './components/EditorShell';

const App = location.pathname === '/renderer' ? Renderer : EditorShell;
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);