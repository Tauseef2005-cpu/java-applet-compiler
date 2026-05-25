import React from 'react';
import { Editor as MonacoEditor } from '@monaco-editor/react';

export default function Editor({ code, onChange, theme }) {
  const handleEditorChange = (value) => {
    if (value !== undefined) {
      onChange(value);
    }
  };

  return (
    <MonacoEditor
      height="100%"
      language="java"
      theme={theme}
      value={code}
      onChange={handleEditorChange}
      options={{
        minimap: { enabled: true },
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
        formatOnPaste: true,
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: "smooth",
        padding: { top: 16 }
      }}
      loading={<div className="flex justify-center items-center h-full text-gray-400">Loading Editor...</div>}
    />
  );
}
