import { useMemo, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useEditor } from '../services/Store';
import { capsFor, type SplitConfig } from '../services/Animation';
import type { ASTNode, GSAPTween } from '../types/Common';

const box = 'w-full bg-[#2A2A2A] rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-[#3b82f6]';
 
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block"><span className="block text-xs text-neutral-500 mb-1">{label}</span>{children}</label>
);
const Heading = ({ children }: { children: ReactNode }) => (
  <div className="pt-2 text-xs uppercase tracking-wide text-neutral-500">{children}</div>
);
 
/** Live updates while typing; one undo step on blur. */
function Text({ value, onLive, ...rest }: { value: string; onLive: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const commit = useEditor(s => s.commit);
  return <input className={box} {...rest} value={value} onChange={e => onLive(e.target.value)} onBlur={commit} />;
}
 
function Num({ label, value, onLive }: { label: string; value: number | undefined; onLive: (v: number | undefined) => void }) {
  const commit = useEditor(s => s.commit);
  return (
    <Field label={label}>
      <input type="number" className={box} value={value ?? ''} onBlur={commit}
        onChange={e => {
          if (e.target.value === '' && e.target.validity.badInput) return; // mid-typing "-" etc.
          onLive(e.target.value === '' ? undefined : Number(e.target.value));
        }} />
    </Field>
  );
}
 
function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return <select className={box} value={value} onChange={e => onChange(e.target.value)}>
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>;
}
 
/* ---------------- Design ---------------- */
function DesignTab({ node }: { node: ASTNode }) {
  const updateNode = useEditor(s => s.updateNode);
  const commit = useEditor(s => s.commit);
  const s = node.style;
  const set = (style: Partial<ASTNode['style']>, live = true) => updateNode(node.id, { style }, live);
  const flexy = s.layout !== 'block';
  return (
    <>
      <Field label="Name"><Text value={node.name} onLive={name => updateNode(node.id, { name }, true)} /></Field>
      {node.type === 'TEXT' && (
        <Field label="Text"><Text value={node.content ?? ''} onLive={content => updateNode(node.id, { content }, true)} /></Field>
      )}
      <Heading>Layout</Heading>
      <Field label="Display"><Select value={s.layout} options={['flex', 'grid', 'block']} onChange={v => set({ layout: v as ASTNode['style']['layout'] }, false)} /></Field>
      {flexy && <>
        <Field label="Justify"><Select value={s.justifyContent ?? 'flex-start'} options={['flex-start', 'center', 'flex-end', 'space-between', 'space-around']} onChange={v => set({ justifyContent: v }, false)} /></Field>
        <Field label="Align"><Select value={s.alignItems ?? 'stretch'} options={['stretch', 'flex-start', 'center', 'flex-end']} onChange={v => set({ alignItems: v }, false)} /></Field>
      </>}
      <Field label={`Padding (${parseInt(s.padding ?? '0', 10) || 0}px)`}>
        <input type="range" min={0} max={80} className="w-full" value={parseInt(s.padding ?? '0', 10) || 0}
          onChange={e => set({ padding: `${e.target.value}px` })} onPointerUp={commit} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Width"><Text value={s.width ?? ''} placeholder="auto" onLive={width => set({ width })} /></Field>
        <Field label="Height"><Text value={s.height ?? ''} placeholder="auto" onLive={height => set({ height })} /></Field>
      </div>
      <Heading>Color</Heading>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Background"><Text type="color" value={s.background ?? '#000000'} onLive={background => set({ background })} /></Field>
        {node.type === 'TEXT' && <Field label="Text color"><Text type="color" value={s.color ?? '#000000'} onLive={color => set({ color })} /></Field>}
      </div>
      {node.type === 'TEXT' && (
        <Field label="Font size"><Text value={s.fontSize ?? ''} placeholder="16px" onLive={fontSize => set({ fontSize })} /></Field>
      )}
    </>
  );
}
 
/* ---------------- Animate ---------------- */
const EASES = ['none', 'power1.out', 'power2.out', 'power3.inOut', 'back.out(1.7)', 'elastic.out(1,0.3)', 'bounce.out'];
const TRIGGERS: GSAPTween['trigger'][] = ['ON_LOAD', 'ON_CLICK', 'ON_HOVER', 'ON_SCROLL'];
const TRANSFORMS = ['x', 'y', 'rotation', 'scale', 'opacity'];
const SCROLL_DEFAULTS = { start: 'top 80%', end: 'bottom 20%', scrub: false };
 
const num = (re: RegExp, s: string) => { const m = s.match(re); return m ? Number(m[1]) : undefined; };
const composeFilter = (blur?: number, bright?: number) =>
  [blur != null && `blur(${blur}px)`, bright != null && `brightness(${bright}%)`].filter(Boolean).join(' ') || undefined;
 
function TweenCard({ t, caps, upd, del }: {
  node: ASTNode; t: GSAPTween; caps: ReturnType<typeof capsFor>;
  upd: (fn: (t: GSAPTween) => GSAPTween, live?: boolean) => void; del: () => void;
}) {
  const props = t.properties as Record<string, any>;
  const setProp = (k: string, v: unknown, live = true) =>
    upd(x => {
      const p = { ...x.properties };
      if (v === undefined || v === false) delete p[k]; else p[k] = v;
      return { ...x, properties: p };
    }, live);
  const filter = (props.filter as string) ?? '';
  const split = props.splitText as SplitConfig | undefined;
  const sp = t.scrollProps ?? SCROLL_DEFAULTS;
 
  return (
    <div className="rounded border border-neutral-700 p-2 space-y-2">
      <div className="flex gap-2">
        <Select value={t.trigger} options={TRIGGERS} onChange={trigger => upd(x => ({ ...x, trigger: trigger as GSAPTween['trigger'], scrollProps: trigger === 'ON_SCROLL' ? x.scrollProps ?? SCROLL_DEFAULTS : x.scrollProps }), false)} />
        <button aria-label="Delete animation" className="px-2 text-neutral-500 hover:text-red-400" onClick={del}>✕</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Mode"><Select value={t.from ? 'from' : 'to'} options={['to', 'from']} onChange={v => upd(x => ({ ...x, from: v === 'from' }), false)} /></Field>
        <Field label="Ease"><Select value={t.ease} options={EASES} onChange={ease => upd(x => ({ ...x, ease }), false)} /></Field>
        <Num label="Duration (s)" value={t.duration} onLive={v => upd(x => ({ ...x, duration: v ?? 0 }), true)} />
        <Num label="Delay (s)" value={t.delay} onLive={v => upd(x => ({ ...x, delay: v ?? 0 }), true)} />
      </div>
      <Heading>Properties</Heading>
      <div className="grid grid-cols-2 gap-2">
        {TRANSFORMS.map(k => <Num key={k} label={k} value={props[k]} onLive={v => setProp(k, v)} />)}
        {caps.filters && <>
          <Num label="blur (px)" value={num(/blur\(([\d.]+)px\)/, filter)} onLive={v => setProp('filter', composeFilter(v, num(/brightness\(([\d.]+)%\)/, filter)))} />
          <Num label="brightness (%)" value={num(/brightness\(([\d.]+)%\)/, filter)} onLive={v => setProp('filter', composeFilter(num(/blur\(([\d.]+)px\)/, filter), v))} />
        </>}
      </div>
      {caps.drawSVG && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!props.drawSVG} onChange={e => setProp('drawSVG', e.target.checked, false)} /> Draw stroke (DrawSVG)
        </label>
      )}
      {caps.splitText && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Split text"><Select value={split?.type ?? 'off'} options={['off', 'chars', 'words', 'lines']}
            onChange={v => setProp('splitText', v === 'off' ? undefined : { type: v, stagger: split?.stagger ?? 0.05 }, false)} /></Field>
          {split && <Num label="Stagger (s)" value={split.stagger} onLive={v => setProp('splitText', { ...split, stagger: v ?? 0 })} />}
        </div>
      )}
      {t.trigger === 'ON_SCROLL' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Start"><Text value={sp.start} onLive={start => upd(x => ({ ...x, scrollProps: { ...sp, start } }), true)} /></Field>
          <Field label="End"><Text value={sp.end} onLive={end => upd(x => ({ ...x, scrollProps: { ...sp, end } }), true)} /></Field>
          <label className="flex items-center gap-2 text-sm col-span-2">
            <input type="checkbox" checked={sp.scrub} onChange={e => upd(x => ({ ...x, scrollProps: { ...sp, scrub: e.target.checked } }), false)} /> Scrub
          </label>
        </div>
      )}
    </div>
  );
}
 
function AnimateTab({ node }: { node: ASTNode }) {
  const updateNode = useEditor(s => s.updateNode);
  const caps = useMemo(() => capsFor(node), [node.type, node.content]); // eslint-disable-line react-hooks/exhaustive-deps
  const setAll = (animations: GSAPTween[], live = false) => updateNode(node.id, { animations }, live);
  return (
    <>
      {node.animations.map(t => (
        <TweenCard key={t.id} node={node} t={t} caps={caps}
          upd={(fn, live) => setAll(node.animations.map(x => (x.id === t.id ? fn(x) : x)), live)}
          del={() => setAll(node.animations.filter(x => x.id !== t.id))} />
      ))}
      <button className="w-full rounded bg-[#2A2A2A] hover:bg-[#333] py-2 text-sm"
        onClick={() => setAll([...node.animations, { id: crypto.randomUUID(), trigger: 'ON_LOAD', duration: 1, delay: 0, ease: 'power2.out', properties: { x: 100 } }])}>
        + Add animation
      </button>
    </>
  );
}
 
/* ---------------- Shell ---------------- */
export default function Inspector() {
  const node = useEditor(s => s.ast.find(n => n.id === s.selectedId));
  const [tab, setTab] = useState<'design' | 'animate'>('design');
  return (
    <aside id="inspector-panel" className="w-72 border-l border-neutral-700 flex flex-col min-h-0">
      <div className="flex border-b border-neutral-700 text-sm">
        {(['design', 'animate'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 capitalize ${tab === t ? 'border-b-2 border-[#3b82f6] text-white' : 'text-neutral-400'}`}>{t}</button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {!node ? <p className="text-sm text-neutral-500">Select a layer to edit it.</p>
          : tab === 'design' ? <DesignTab key={node.id} node={node} /> : <AnimateTab key={node.id} node={node} />}
      </div>
    </aside>
  );
}
 