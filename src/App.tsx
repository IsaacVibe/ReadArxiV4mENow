import { useRef, useState, type CSSProperties } from 'react';
import { Bird, BookOpen, Info, Download, FolderOpen, LayoutList, Moon, Settings2, Sun, X } from 'lucide-react';
import { useStore } from './store/useStore';
import { PaperList } from './components/PaperList';
import { ChatPanel } from './components/ChatPanel';
import { useTheme } from './hooks/useTheme';
import { useWorkspace } from './hooks/useWorkspace';
import { exportWorkspace } from './utils/workspace';
import { pageScales, usePageScale } from './hooks/usePageScale';

function App() {
  const workspace = useWorkspace();
  const { scale, setScale } = usePageScale();
  const { theme, setTheme, isDark, toggleTheme } = useTheme();
  const busy = useStore(s => s.generationTask);
  const hasData = useStore(s => !!s.dailyData);
  const model = useStore(s => s.model);
  const [mode, setMode] = useState<'screen' | 'read'>('screen');
  const [split, setSplit] = useState(52);
  const [dragging, setDragging] = useState(false);
  const [readRequest, setReadRequest] = useState(0);
  const main = useRef<HTMLDivElement>(null);
  const chooseMode = (next: 'screen' | 'read') => { setMode(next); setSplit(next === 'screen' ? 52 : 32); };
  const read = () => { chooseMode('read'); setReadRequest(value => value + 1); };
  const browse = () => { chooseMode('screen'); document.getElementById('paper-search')?.focus(); };
  const saveText = { local: '请导出保存', linked: '自动保存', saving: '正在保存…', saved: `已保存 ${workspace.savedAt}`, error: '保存失败' }[workspace.saveState];

  return <div className={`app-shell mode-${mode}${dragging ? ' is-resizing' : ''}`} style={{ zoom: scale / 100, '--page-scale': scale / 100 } as CSSProperties}>
    <a className="skip-link" href="#paper-search">跳到论文搜索</a><a className="skip-link" href="#research-reader">跳到精读区域</a>
    <header className="app-header"><div className="brand"><span className="brand-mark"><Bird size={27} strokeWidth={1.5} /></span><span className="brand-name">RAVEN</span></div>
      <nav className="workspace-modes" aria-label="工作模式"><button className={mode === 'screen' ? 'active' : ''} aria-pressed={mode === 'screen'} onClick={() => chooseMode('screen')}><LayoutList size={16} />筛选</button><button className={mode === 'read' ? 'active' : ''} aria-pressed={mode === 'read'} onClick={() => chooseMode('read')}><BookOpen size={16} />精读</button></nav>
      <div className={`save-indicator${workspace.saveState === 'error' ? ' has-error' : ''}`} role="status" title={workspace.saveState === 'local' ? '尚未关联可写文件，请导出保存' : workspace.filename}><span className="save-dot" /><span>{saveText}</span>{workspace.saveState === 'error' && <button className="text-button" onClick={workspace.retrySave}>重试</button>}</div>
      <div className="header-actions"><label className="font-control" title="整页缩放"><span aria-hidden="true">Aa</span><select aria-label="页面缩放" value={scale} onChange={e => setScale(Number(e.target.value))}>{pageScales.map(value => <option key={value} value={value}>{value}%</option>)}</select></label><button className="button" disabled={!!busy} onClick={() => void workspace.open()}><FolderOpen size={16} /><span>打开工作区</span></button><button className="button" disabled={!hasData} onClick={() => { exportWorkspace(useStore.getState()); workspace.setNotice('已导出工作区，请在浏览器下载中确认。'); }}><Download size={16} /><span>导出</span></button><button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={isDark ? '切换浅色主题' : '切换深色主题'} title={isDark ? '切换浅色主题' : '切换深色主题'}>{isDark ? <Sun size={18} /> : <Moon size={18} />}</button>
        <details className="settings" onKeyDown={e => { if (e.key === 'Escape') e.currentTarget.open = false; }}><summary className="icon-button" aria-label="工作区设置" title="工作区设置"><Settings2 size={18} /></summary><div className="settings-panel"><h2>工作区设置</h2><label htmlFor="model-setting">模型名称</label><input id="model-setting" value={model} disabled={!!busy} onChange={e => useStore.getState().setModel(e.target.value)} placeholder="填写服务支持的模型名称" /><label htmlFor="theme-setting">外观</label><select id="theme-setting" value={theme} onChange={e => setTheme(e.target.value as 'light' | 'dark' | 'system')}><option value="light">浅色</option><option value="dark">深色</option><option value="system">跟随系统</option></select><button className="button" disabled={!!busy} onClick={workspace.importCopy}>导入 JSON 副本</button><button className="text-button" onClick={() => chooseMode(mode)}>重置分栏比例</button></div></details>
      </div>
    </header>
    <input ref={workspace.fileInput} type="file" accept=".json,application/json" aria-label="导入 JSON 副本" className="sr-only" tabIndex={-1} onChange={e => { const file = e.target.files?.[0]; if (file) void workspace.importFile(file); e.target.value = ''; }} />
    {workspace.notice && <div className="workspace-notice" role="status"><Info size={16} /><span>{workspace.notice}</span><button className="icon-button" aria-label="关闭工作区提示" onClick={() => workspace.setNotice('')}><X size={16} /></button></div>}
    <main className="workspace-grid" ref={main} style={{ gridTemplateColumns: `${split}fr 8px ${100 - split}fr` }}>
      <div className="library-pane"><PaperList onRead={read} loading={workspace.loading} error={workspace.loadError} onRetry={() => void workspace.load()} onOpen={() => void workspace.open()} /></div>
      <div className="column-divider" role="separator" tabIndex={0} aria-label="调整论文库宽度" aria-orientation="vertical" aria-valuemin={28} aria-valuemax={70} aria-valuenow={Math.round(split)} aria-valuetext={`论文库占 ${Math.round(split)}%`} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); setSplit(value => e.key === 'Home' ? 28 : e.key === 'End' ? 70 : Math.max(28, Math.min(70, value + (e.key === 'ArrowRight' ? 2 : -2)))); } }} onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); }} onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; const bounds = main.current?.getBoundingClientRect(); if (bounds) setSplit(Math.max(28, Math.min(70, (e.clientX - bounds.left) / bounds.width * 100))); }} onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); setDragging(false); }} onPointerCancel={() => setDragging(false)} onLostPointerCapture={() => setDragging(false)} />
      <div className="reader-pane" id="research-reader" tabIndex={-1}><ChatPanel onBrowse={browse} readRequest={readRequest} /></div>
    </main>
  </div>;
}
export default App;
