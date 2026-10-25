import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { ASTNode, GSAPTween } from '../types/Common';
import { DRAW_SELECTOR, tweenVars } from './Animation';
 
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
    background: s.background,
    color: s.color,
    fontSize: s.fontSize,
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
  const { vars, draw, split, from } = tweenVars(node, t);
  const v = JSON.stringify(vars);
  const target = draw ? `el.querySelectorAll(${JSON.stringify(DRAW_SELECTOR)})` : split ? 'split.chars' : 'el';
  const call = draw
    ? `gsap.fromTo(${target}, { drawSVG: '0%' }, { ...${v}, drawSVG: '100%', ...extra })`
    : `gsap.${from ? 'from' : 'to'}(${target}, { ...${v}, ...extra })`;
  const evt = t.trigger === 'ON_CLICK' ? 'click' : 'mouseenter';
  const trigger =
    t.trigger === 'ON_LOAD' ? 'run();'
    : t.trigger === 'ON_SCROLL' ? `run({ scrollTrigger: { trigger: el, ...${JSON.stringify(t.scrollProps ?? {})} } });`
    : `const h = () => run(); el.addEventListener('${evt}', h); cleanups.push(() => el.removeEventListener('${evt}', h));`;
  const splitSetup = split
    ? ` const split = SplitText.create(el, { type: ${JSON.stringify(split.type)} }); cleanups.push(() => split.revert());` : '';
  return `{ const el = ${refName(node.id)}.current; if (el) {${splitSetup} const run = (extra: gsap.TweenVars = {}) => ${call}; ${trigger} } }`;
}
 
export function compileApp(ast: ASTNode[]): string {
  const roots = children(ast, null);
  const usesScroll = ast.some(n => n.animations.some(a => a.trigger === 'ON_SCROLL'));
  const resolved = ast.flatMap(n => n.animations.map(t => tweenVars(n, t)));
  const usesDraw = resolved.some(r => r.draw);
  const usesSplit = resolved.some(r => r.split);
  const pluginImports = [
    usesScroll && "import { ScrollTrigger } from 'gsap/ScrollTrigger';",
    usesDraw && "import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';",
    usesSplit && "import { SplitText } from 'gsap/SplitText';",
  ].filter(Boolean).join('\n');
  const registered = ['useGSAP', usesScroll && 'ScrollTrigger', usesDraw && 'DrawSVGPlugin', usesSplit && 'SplitText']
    .filter(Boolean).join(', ');
  const refs = ast.map(n => `  const ${refName(n.id)} = useRef<any>(null);`).join('\n');
  const tweens = ast.flatMap(n => n.animations.map(t => '      ' + toTween(n, t))).join('\n');
 
  return `import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
${pluginImports}
gsap.registerPlugin(${registered});
 
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
 