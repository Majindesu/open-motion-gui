import { useRef } from 'react';
import { newProject, openProjectFile, saveProjectFile } from '../services/Persist';

const btn = 'px-2 py-1 rounded bg-[#2A2A2A] hover:bg-[#333]';
const guard = async (fn: () => unknown) => {
  try { await fn(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
};

export default function FileMenu() {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className={btn} onClick={() => confirm('Start a new project? The current one will be replaced.') && newProject()}>New</button>
      <button className={btn} onClick={() => input.current?.click()}>Open…</button>
      <button className={btn} onClick={() => guard(saveProjectFile)}>Save</button>
      <input ref={input} type="file" accept=".zip" hidden
        onChange={e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f && confirm('Opening a project replaces the current one. Continue?')) guard(() => openProjectFile(f));
        }} />
    </>
  );
}