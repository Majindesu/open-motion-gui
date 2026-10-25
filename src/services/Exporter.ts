import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { ASTNode, GSAPTween } from '../types/Common';
 
const refName = (id: string) => 'ref_' + id.replace(/[^a-zA-Z0-9]/g, '_');
const children = (ast: ASTNode[], pid: string | null) =>
  ast.filter(n => n.parentId === pid).sort((a, b) => a.style.zIndex - b.style.zIndex);
 
// ---------- AST -> JSX ----------
function toJSX(ast: ASTNode[], node: ASTNode, depth: number): string {
  const pad = '  '.repeat(depth);
  const s = node.style;
  const style = {
    display: s.layout,
    justifyContent: s.justifyContent,
    alignItems: s.alignItems,
    padding: s.padding,
    width: s.width,
    height: s.height,
    position: 'relative',
    zIndex: s.zIndex,
    ...(node.animations.length ? { isolation: 'isolate' } : {}),
  };
  const attrs = `ref={${refName(node.id)}} style={${JSON.stringify(style)}}`;
  const kids = children(ast, node.id).map(k => toJSX(ast, k, depth + 1)).join('\n');
 
  switch (node.type) {
    case 'RASTER':
      return `${pad}<img ${attrs} src=${JSON.stringify(node.src ?? '')} alt=${JSON.stringify(node.name)} />`;
    case 'INLINE_SVG': // content must already be DOMPurify-sanitized
      return `${pad}<div ${attrs} dangerouslySetInnerHTML={{ __html: ${JSON.stringify(node.content ?? '')} }} />`;
    case 'TEXT':
      return `${pad}<p ${attrs}>{${JSON.stringify(node.content ?? '')}}</p>`;
    default:
      return `${pad}<div ${attrs}>\n${kids}\n${pad}</div>`;
  }
}
 
// ---------- Tweens -> GSAP code ----------
function toTween(node: ASTNode, t: GSAPTween): string {
  const el = `${refName(node.id)}.current`;
  const vars = JSON.stringify({ ...t.properties, duration: t.duration, delay: t.delay, ease: t.ease });
 
  switch (t.trigger) {
    case 'ON_LOAD':
      return `gsap.to(${el}, ${vars});`;
    case 'ON_SCROLL':
      return `gsap.to(${el}, { ...${vars}, scrollTrigger: { trigger: ${el}, ...${JSON.stringify(t.scrollProps ?? {})} } });`;
    default: {
      const evt = t.trigger === 'ON_CLICK' ? 'click' : 'mouseenter';
      return `{ const el = ${el}; if (el) { const h = () => gsap.to(el, ${vars}); el.addEventListener('${evt}', h); cleanups.push(() => el.removeEventListener('${evt}', h)); } }`;
    }
  }
}
 
export function compileApp(ast: ASTNode[]): string {
  const roots = children(ast, null);
  const usesScroll = ast.some(n => n.animations.some(a => a.trigger === 'ON_SCROLL'));
  const refs = ast.map(n => `  const ${refName(n.id)} = useRef<any>(null);`).join('\n');
  const tweens = ast.flatMap(n => n.animations.map(t => '      ' + toTween(n, t))).join('\n');
 
  return `import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
${usesScroll ? "import { ScrollTrigger } from 'gsap/ScrollTrigger';\n" : ''}
gsap.registerPlugin(useGSAP${usesScroll ? ', ScrollTrigger' : ''});
 
export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
${refs}
 
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(min-width: 768px)', () => {
      const cleanups: Array<() => void> = [];
${tweens}
      return () => cleanups.forEach(fn => fn());
    });
  }, { scope: containerRef });
 
  return (
    <div ref={containerRef} className="flex flex-col w-full min-h-screen">
${roots.map(r => toJSX(ast, r, 3)).join('\n')}
    </div>
  );
}
`;
}
 
// ---------- Static boilerplate ----------
const files: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'gsap-project', private: true, version: '0.0.0', type: 'module',
    scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
    dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1', gsap: '^3.13.0', '@gsap/react': '^2.1.2' },
    devDependencies: {
      '@types/react': '^18.3.12', '@types/react-dom': '^18.3.1', '@vitejs/plugin-react': '^4.3.4',
      '@tailwindcss/vite': '^4.1.0', tailwindcss: '^4.1.0', typescript: '^5.6.3', vite: '^6.0.0',
    },
  }, null, 2),
  'vite.config.ts': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
 
export default defineConfig({ plugins: [react(), tailwindcss()] });
`,
  'tsconfig.json': JSON.stringify({
    compilerOptions: { target: 'ES2020', module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true, noEmit: true },
    include: ['src'],
  }, null, 2),
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GSAP Project</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  'src/main.tsx': `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
 
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
`,
  'src/index.css': `@import "tailwindcss";\n`,
};
 
export async function exportProject(ast: ASTNode[]) {
  const zip = new JSZip();
  const root = zip.folder('gsap-project')!;
  for (const [path, body] of Object.entries(files)) root.file(path, body);
  root.file('src/App.tsx', compileApp(ast));
  saveAs(await zip.generateAsync({ type: 'blob' }), 'gsap-project.zip');
}