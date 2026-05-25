import React, { useRef, useEffect, useState } from 'react';
import { Terminal, Trash2, ArrowUpRight, ChevronDown } from 'lucide-react';

export default function Console({ logs, onClear, onSendInput, isRunning, onToggleCollapse }) {
  const scrollRef = useRef(null);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || !isRunning) return;
    onSendInput(inputValue);
    setInputValue('');
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-[#d4d4d4] font-mono text-sm border-t border-[#252526]">
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#252526] border-b border-[#3c3c3c] shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-gray-400" />
          <span className="uppercase text-xs font-semibold tracking-wider text-gray-400">Console</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onClear}
            className="p-1 hover:bg-[#3c3c3c] rounded text-gray-400 transition-colors"
            title="Clear Console"
          >
            <Trash2 size={14} />
          </button>
          {onToggleCollapse && (
            <button 
              onClick={onToggleCollapse}
              className="p-1 hover:bg-[#3c3c3c] rounded text-gray-400 transition-colors"
              title="Hide Console"
            >
              <ChevronDown size={14} />
            </button>
          )}
        </div>
      </div>
      <div 
        ref={scrollRef}
        className="flex-1 overflow-auto p-4 space-y-1"
      >
        {logs.length === 0 && (
          <div className="text-gray-500 italic">No output...</div>
        )}
        {logs.map((log, index) => {
          let className = 'text-green-400';
          if (log.type === 'error') {
            className = 'text-red-400';
          } else if (log.type === 'status') {
            className = 'text-blue-400 italic';
          } else if (log.type === 'stdout') {
            className = 'text-[#d4d4d4]';
          } else if (log.type === 'stderr') {
            className = 'text-red-400';
          } else if (log.type === 'stdin') {
            className = 'text-yellow-500 font-bold';
          }
          
          return (
            <div 
              key={index} 
              className={`whitespace-pre-wrap ${className}`}
            >
              {log.type === 'stdin' ? `> ${log.text}` : log.text}
            </div>
          );
        })}
      </div>
      
      {/* Console Input Bar */}
      <form onSubmit={handleSubmit} className="flex border-t border-[#3c3c3c] bg-[#1a1a1a] items-center shrink-0">
        <span className="text-gray-500 pl-4 select-none font-bold">&gt;</span>
        <input 
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={!isRunning}
          placeholder={isRunning ? "Type standard input (stdin) for your program..." : "Compile & Run to enable stdin..."}
          className="flex-1 bg-transparent border-none outline-none text-[#d4d4d4] font-mono text-sm px-2 py-2.5 focus:ring-0 placeholder-gray-600 disabled:cursor-not-allowed"
        />
        {isRunning && (
          <button 
            type="submit" 
            className="px-3 py-1.5 mr-2 text-xs font-semibold bg-[#2d2d2d] hover:bg-[#3c3c3c] text-gray-300 rounded border border-[#3c3c3c] flex items-center gap-1 transition-colors"
          >
            Send <ArrowUpRight size={12} />
          </button>
        )}
      </form>
    </div>
  );
}
