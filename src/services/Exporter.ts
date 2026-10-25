import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { ASTNode, GSAPTween } from "../types/Common";
import { tweenVars, DRAW_SELECTOR } from "../services/Animation";
import { getAsset } from "../utils/Assets";
import { nodeStyle, ROOT_CLASS } from "./Layout";
import runtimeSource from "./Runtime.ts?raw";

const children = (ast: ASTNode[], pid: string | null) =>
  ast
    .filter((n) => n.parentId === pid)
    .sort((a, b) => a.style.zIndex - b.style.zIndex);

// ---------- AST -> JSX (styles come from the same nodeStyle() the canvas uses) ----------
function toJSX(ast: ASTNode[], node: ASTNode, depth: number): string {
  const pad = "  ".repeat(depth);
  // Only animated nodes need an id: the runtime finds them by data-node-id.
  const id = node.animations.length
    ? `data-node-id=${JSON.stringify(node.id)} `
    : "";
  const attrs = `${id}style={${JSON.stringify(nodeStyle(node))}}`;

  switch (node.type) {
    case "RASTER":
      return `${pad}<img ${attrs} src=${JSON.stringify(node.src ?? "")} alt=${JSON.stringify(node.name)} />`;
    case "INLINE_SVG": // content is DOMPurify-sanitized at import
      return `${pad}<div ${attrs} dangerouslySetInnerHTML={{ __html: ${JSON.stringify(node.content ?? "")} }} />`;
    case "TEXT":
      return `${pad}<p ${attrs}>{${JSON.stringify(node.content ?? "")}}</p>`;
    default: {
      const kids = children(ast, node.id)
        .map((k) => toJSX(ast, k, depth + 1))
        .join("\n");
      return `${pad}<div ${attrs}>\n${kids}\n${pad}</div>`;
    }
  }
}
 
export function compileApp(ast: ASTNode[]): string {
  const animated = ast
    .filter((n) => n.animations.length)
    .map((n) => ({
      id: n.id,
      type: n.type,
      content: n.type === "INLINE_SVG" ? n.content : undefined,
      animations: n.animations,
    }));

  return `import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { buildAnimations, type RuntimeNode } from './animations';
 
gsap.registerPlugin(useGSAP);
 
// Animation data for the elements below. ./animations.ts is the same runtime the editor's canvas runs.
const animated: RuntimeNode[] = ${JSON.stringify(animated, null, 2)};
 
export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
 
  useGSAP(() => {
    if (!containerRef.current) return;
    const built = buildAnimations(containerRef.current, animated);
    return () => built.revert();
  }, { scope: containerRef });
 
  return (
    <div ref={containerRef} className="${ROOT_CLASS}">
${children(ast, null)
  .map((r) => toJSX(ast, r, 3))
  .join("\n")}
    </div>
  );
}
`;
}
 
// ---------- Static boilerplate ----------
const files: Record<string, string> = {
  "package.json": JSON.stringify(
    {
      name: "gsap-project",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
      dependencies: {
        react: "^18.3.1",
        "react-dom": "^18.3.1",
        gsap: "^3.13.0",
        "@gsap/react": "^2.1.2",
      },
      devDependencies: {
        "@types/react": "^18.3.12",
        "@types/react-dom": "^18.3.1",
        "@vitejs/plugin-react": "^4.3.4",
        "@tailwindcss/vite": "^4.1.0",
        tailwindcss: "^4.1.0",
        typescript: "^5.6.3",
        vite: "^6.0.0",
      },
    },
    null,
    2,
  ),
  "vite.config.ts": `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
 
export default defineConfig({ plugins: [react(), tailwindcss()] });
`,
  "tsconfig.json": JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        lib: ["ES2020", "DOM", "DOM.Iterable"],
      },
      include: ["src"],
    },
    null,
    2,
  ),
  "index.html": `<!doctype html>
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
  "src/main.tsx": `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
 
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
`,
  "src/index.css": `@import "tailwindcss";\n`, // renderer.css in the editor is identical
  "src/animations.ts": runtimeSource,
};
 
export async function exportProject(ast: ASTNode[]) {
  const zip = new JSZip();
  const root = zip.folder("gsap-project")!;
  for (const [path, body] of Object.entries(files)) root.file(path, body);
 
  // Uploaded images ship as real files in public/assets/ and are referenced by URL from App.tsx.
  const paths: Record<string, string> = {};
  for (const id of new Set(
    ast.flatMap((n) => (n.assetId ? [n.assetId] : [])),
  )) {
    const rec = await getAsset(id);
    if (!rec) continue;
    paths[id] = `/assets/${id}.${rec.ext}`;
    root.file(`public${paths[id]}`, rec.blob);
  }
  const exportAst = ast.map((n) =>
    n.assetId && paths[n.assetId] ? { ...n, src: paths[n.assetId] } : n,
  );
  root.file("src/App.tsx", compileApp(exportAst));
  saveAs(await zip.generateAsync({ type: "blob" }), "gsap-project.zip");
}
