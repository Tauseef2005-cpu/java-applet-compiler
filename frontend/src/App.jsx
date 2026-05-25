import React, { useState, useEffect, useRef } from 'react';
import Split from 'react-split';
import { Play, Square, RotateCcw, Settings, Terminal, Code2, Folder, LayoutTemplate } from 'lucide-react';
import Editor from './components/Editor';
import Preview from './components/Preview';
import Console from './components/Console';
import { defaultTemplate, animationTemplate, textFieldTemplate } from './templates/ExampleTemplates';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : 'https://java-applet-compiler.onrender.com';

function App() {
  const [code, setCode] = useState(defaultTemplate);
  const [logs, setLogs] = useState([]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [processInfo, setProcessInfo] = useState(null);
  const [exitCode, setExitCode] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [theme, setTheme] = useState('vs-dark'); // vs-dark or light
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState('editor'); // editor, preview, console
  const [activeTemplateName, setActiveTemplateName] = useState('Hello World');

  const debouncedCompile = useRef(null);

  useEffect(() => {
    // Initial syntax check
    compileCode(code);

    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleCodeChange = (newCode) => {
    setCode(newCode);
    if (debouncedCompile.current) clearTimeout(debouncedCompile.current);

    debouncedCompile.current = setTimeout(() => {
      compileCode(newCode);
    }, 1000); // Debounce by 1 second
  };

  const compileCode = async (javaCode) => {
    if (isRunning) return; // Don't check syntax if program is running
    setIsCompiling(true);
    setStatusMessage('Checking syntax...');
    try {
      const response = await fetch(`${API_BASE}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: javaCode })
      });
      const data = await response.json();

      if (response.ok) {
        setStatusMessage('Syntax OK');
      } else {
        setLogs(prev => {
          // Prevent duplicate logs of the same compile error
          if (prev.length > 0 && prev[prev.length - 1].text === data.error) return prev;
          return [...prev, { type: 'error', text: data.error }];
        });
        setStatusMessage('Syntax Error');
      }
    } catch (err) {
      // Ignore network errors on keystrokes
    } finally {
      setIsCompiling(false);
    }
  };

  const runCode = async (javaCode) => {
    setIsCompiling(true);
    setIsRunning(false);
    setExitCode(null);
    setProcessInfo(null);
    setLogs([{ type: 'status', text: 'Initiating native run...' }]);
    setStatusMessage('Compiling...');

    try {
      const response = await fetch(`${API_BASE}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: javaCode })
      });

      if (!response.ok) {
        const text = await response.text();
        let errMsg = text;
        try {
          const parsed = JSON.parse(text);
          errMsg = parsed.error || text;
        } catch (e) { }
        setLogs(prev => [...prev, { type: 'error', text: errMsg }]);
        setIsCompiling(false);
        setStatusMessage('Compilation failed');
        return;
      }

      setIsCompiling(false);
      setIsRunning(true);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            try {
              const data = JSON.parse(trimmed.slice(5).trim());
              handleStreamEvent(data);
            } catch (err) {
              console.error('Error parsing SSE line:', trimmed, err);
            }
          }
        }
      }
    } catch (err) {
      console.error("Connection error:", err);
      setLogs(prev => [...prev, { type: 'error', text: 'Error connecting to compilation server: ' + err.message }]);
      setIsCompiling(false);
      setIsRunning(false);
      setStatusMessage('Connection failed');
    }
  };

  const handleStreamEvent = (data) => {
    switch (data.type) {
      case 'status':
        setStatusMessage(data.text);
        setLogs(prev => [...prev, { type: 'status', text: data.text }]);
        break;
      case 'start':
        setProcessInfo({ pid: data.pid, isApplet: data.isApplet });
        break;
      case 'stdout':
        setLogs(prev => [...prev, { type: 'stdout', text: data.text }]);
        break;
      case 'stderr':
        setLogs(prev => [...prev, { type: 'stderr', text: data.text }]);
        break;
      case 'error':
        setLogs(prev => [...prev, { type: 'error', text: data.text }]);
        setIsRunning(false);
        setStatusMessage('Runtime error');
        break;
      case 'exit':
        setExitCode(data.code);
        setIsRunning(false);
        setStatusMessage(`Exited with ${data.code}`);
        setLogs(prev => [...prev, { type: 'status', text: `Process exited with code ${data.code}.` }]);
        break;
      default:
        break;
    }
  };

  const stopCode = async () => {
    try {
      await fetch(`${API_BASE}/stop`, { method: 'POST' });
      setLogs(prev => [...prev, { type: 'status', text: 'Process stopped by user.' }]);
      setIsRunning(false);
      setStatusMessage('Stopped');
    } catch (err) {
      setLogs(prev => [...prev, { type: 'error', text: 'Failed to stop process.' }]);
    }
  };

  const sendStdin = async (input) => {
    setLogs(prev => [...prev, { type: 'stdin', text: input }]);
    try {
      const response = await fetch(`${API_BASE}/stdin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input })
      });
      if (!response.ok) {
        const errData = await response.json();
        setLogs(prev => [...prev, { type: 'error', text: errData.error || 'Failed to send input.' }]);
      }
    } catch (err) {
      setLogs(prev => [...prev, { type: 'error', text: 'Error sending input to process.' }]);
    }
  };

  const loadTemplate = (name, template) => {
    if (isRunning) {
      stopCode();
    }
    setActiveTemplateName(name);
    setCode(template);
    compileCode(template);
  };

  return (
    <div className="h-screen flex flex-col bg-[#090d16] text-[#cbd5e1] font-sans overflow-hidden">
      {/* Top Navbar */}
      <header className="h-14 bg-[#0e1322]/95 border-b border-[#1e293b] flex items-center justify-between px-3 sm:px-4 shadow-[0_1px_3px_rgba(0,0,0,0.3)] z-10 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="bg-blue-600 text-white p-1.5 rounded shrink-0">
            <Code2 size={18} className="sm:w-5 sm:h-5" />
          </div>
          <h1 className="font-semibold text-sm sm:text-lg tracking-tight text-slate-100 whitespace-nowrap">
            {isMobile ? "Java Applet" : "Java Applet Live Compiler"}
          </h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {!isMobile ? (
            <div className="flex gap-2">
              <button
                onClick={() => loadTemplate('Hello World', defaultTemplate)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-blue-400 hover:bg-[#1a2035] rounded transition-colors"
              >
                <LayoutTemplate size={16} /> Hello World
              </button>
              <button
                onClick={() => loadTemplate('Animation', animationTemplate)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-blue-400 hover:bg-[#1a2035] rounded transition-colors"
              >
                <LayoutTemplate size={16} /> Animation
              </button>
              <button
                onClick={() => loadTemplate('TextField Example', textFieldTemplate)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-blue-400 hover:bg-[#1a2035] rounded transition-colors"
              >
                <LayoutTemplate size={16} /> TextField Example
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-[#1a2035] border border-slate-800 rounded px-1.5 py-1">
              <LayoutTemplate size={14} className="text-blue-400 shrink-0" />
              <select
                value={activeTemplateName}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'Hello World') loadTemplate('Hello World', defaultTemplate);
                  else if (val === 'Animation') loadTemplate('Animation', animationTemplate);
                  else if (val === 'TextField Example') loadTemplate('TextField Example', textFieldTemplate);
                }}
                className="bg-transparent text-slate-300 outline-none border-none cursor-pointer text-xs font-semibold"
              >
                <option value="Hello World" className="bg-[#0e1322]">Hello World</option>
                <option value="Animation" className="bg-[#0e1322]">Animation</option>
                <option value="TextField Example" className="bg-[#0e1322]">TextField Ex</option>
              </select>
            </div>
          )}

          {!isMobile && (
            <>
              <div className="h-6 w-px bg-slate-800"></div>
              <button
                onClick={() => setTheme(theme === 'vs-dark' ? 'light' : 'vs-dark')}
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800/80 transition-colors"
                title="Toggle Theme"
              >
                <Settings size={18} />
              </button>
            </>
          )}

          {isRunning ? (
            <button
              onClick={stopCode}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-medium rounded shadow-sm transition-colors"
            >
              <Square size={14} fill="white" /> Stop
            </button>
          ) : (
            <button
              onClick={() => runCode(code)}
              disabled={isCompiling}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium rounded shadow-sm disabled:bg-blue-400 transition-colors"
            >
              <Play size={14} fill="white" /> Run
            </button>
          )}
        </div>
      </header>

      {/* Tab bar for mobile screens */}
      {isMobile && (
        <div className="flex bg-[#0c101d] border-b border-[#1e293b] text-xs font-semibold text-slate-400 shrink-0 select-none">
          <button
            onClick={() => setActiveTab('editor')}
            className={`flex-1 py-3 text-center border-b-2 transition-all ${activeTab === 'editor'
                ? 'border-blue-500 text-blue-400 bg-blue-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
          >
            Code
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`flex-1 py-3 text-center border-b-2 transition-all ${activeTab === 'preview'
                ? 'border-blue-500 text-blue-400 bg-blue-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
          >
            Applet Preview
          </button>
          <button
            onClick={() => setActiveTab('console')}
            className={`flex-1 py-3 text-center border-b-2 transition-all ${activeTab === 'console'
                ? 'border-blue-500 text-blue-400 bg-blue-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
          >
            Console {logs.length > 0 && `(${logs.length})`}
          </button>
        </div>
      )}

      {/* Main Workspace */}
      {isMobile ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'editor' && (
            <div className="flex-1 flex flex-col overflow-hidden relative bg-[#1e1e1e]">
              <div className="h-9 border-b border-[#252526] flex items-center px-4 bg-[#252526] justify-between shrink-0">
                <span className="text-xs font-medium text-slate-300 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Main.java
                </span>
                {statusMessage && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusMessage.includes('Error') || statusMessage.includes('failed') || statusMessage.includes('error')
                      ? 'bg-red-950/40 text-red-400 border border-red-900/40'
                      : 'bg-blue-950/40 text-blue-400 border border-blue-900/40 animate-pulse'
                    }`}>
                    {statusMessage}
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-hidden">
                <Editor code={code} onChange={handleCodeChange} theme={theme} />
              </div>
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 relative">
              <div className="h-9 border-b border-[#1e293b] flex items-center px-4 bg-[#0e1322]/80 justify-between backdrop-blur-sm z-10 shrink-0">
                <span className="text-xs font-medium text-slate-300 flex items-center gap-2">
                  <Terminal size={14} className="text-slate-400" />
                  Native Environment Execution
                </span>
              </div>
              <div className="flex-1 overflow-hidden p-3 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiMzMzQxNTUiLz48L3N2Zz4=')] flex items-center justify-center">
                <div className="shadow-2xl rounded-lg bg-[#0c101d] w-full h-full flex flex-col overflow-hidden border border-slate-800">
                  <div className="bg-gradient-to-b from-[#181f30] to-[#0f1420] border-b border-slate-800 px-3 py-1.5 flex items-center shrink-0">
                    <span className="text-[10px] font-semibold text-slate-300">JDK 8 Status Monitor</span>
                  </div>
                  <div className="flex-1 relative overflow-hidden">
                    <Preview
                      code={code}
                      isRunning={isRunning}
                      isCompiling={isCompiling}
                      processInfo={processInfo}
                      exitCode={exitCode}
                      statusMessage={statusMessage}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'console' && (
            <div className="flex-1 overflow-hidden">
              <Console
                logs={logs}
                onClear={() => setLogs([])}
                onSendInput={sendStdin}
                isRunning={isRunning}
              />
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex-1 flex overflow-hidden">
            {/* Left Sidebar (Files) */}
            <div className="w-12 bg-[#0c101d] border-r border-[#1e293b] flex flex-col items-center py-4 gap-4 shrink-0">
              <div className="p-2 bg-blue-950/40 text-blue-400 border border-blue-900/50 rounded-lg cursor-pointer">
                <Folder size={20} />
              </div>
            </div>

            {/* Split Container */}
            <Split
              sizes={[50, 50]}
              minSize={300}
              expandToMin={false}
              gutterSize={8}
              gutterAlign="center"
              snapOffset={30}
              dragInterval={1}
              direction="horizontal"
              cursor="col-resize"
              className="split flex-1"
            >
              {/* Editor Panel */}
              <div className="flex flex-col h-full overflow-hidden relative border-r border-[#1e293b] bg-[#1e1e1e]">
                <div className="h-9 border-b border-[#252526] flex items-center px-4 bg-[#252526] justify-between shrink-0">
                  <span className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    Main.java
                  </span>
                  {statusMessage && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${statusMessage.includes('Error') || statusMessage.includes('failed') || statusMessage.includes('error')
                        ? 'bg-red-950/40 text-red-400 border border-red-900/40'
                        : 'bg-blue-950/40 text-blue-400 border border-blue-900/40 animate-pulse'
                      }`}>
                      {statusMessage}
                    </span>
                  )}
                </div>
                <div className="flex-1 overflow-hidden">
                  <Editor code={code} onChange={handleCodeChange} theme={theme} />
                </div>
              </div>

              {/* Preview Panel */}
              <div className="flex flex-col h-full overflow-hidden bg-slate-950 relative">
                <div className="h-9 border-b border-[#1e293b] flex items-center px-4 bg-[#0e1322]/80 justify-between backdrop-blur-sm z-10 shrink-0">
                  <span className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Terminal size={16} className="text-slate-400" />
                    Native Environment Execution
                  </span>
                  {isRunning && (
                    <button
                      onClick={stopCode}
                      className="p-1 hover:bg-red-950/40 hover:text-red-400 rounded text-slate-400 transition-colors"
                      title="Stop Execution"
                    >
                      <Square size={14} fill="currentColor" />
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-hidden p-6 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiMzMzQxNTUiLz48L3N2Zz4=')]">
                  <div className="shadow-2xl rounded-lg bg-[#0c101d] w-full h-full flex flex-col overflow-hidden border border-slate-800">
                    <div className="bg-gradient-to-b from-[#181f30] to-[#0f1420] border-b border-slate-800 px-3 py-1.5 flex items-center shrink-0">
                      <span className="text-xs font-semibold text-slate-300">JDK 8 Status Monitor</span>
                    </div>
                    <div className="flex-1 relative">
                      <Preview
                        code={code}
                        isRunning={isRunning}
                        isCompiling={isCompiling}
                        processInfo={processInfo}
                        exitCode={exitCode}
                        statusMessage={statusMessage}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Split>
          </div>

          {/* Console Panel (Bottom) */}
          <div className="h-48 shrink-0">
            <Console
              logs={logs}
              onClear={() => setLogs([])}
              onSendInput={sendStdin}
              isRunning={isRunning}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default App;
