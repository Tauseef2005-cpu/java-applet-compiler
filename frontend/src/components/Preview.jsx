import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Coffee, Terminal, Cpu, Clock, HelpCircle, XCircle, AlertCircle, MonitorPlay, X, RotateCcw, ChevronDown, Check, Info } from 'lucide-react';


// Helper function to extract method body with balanced braces
function getMethodBody(code, signatureRegex) {
  const match = code.match(signatureRegex);
  if (!match) return null;

  const startIndex = match.index + match[0].length;
  let braceCount = 1;
  let endIndex = startIndex;

  while (braceCount > 0 && endIndex < code.length) {
    const char = code[endIndex];
    if (char === '{') braceCount++;
    else if (char === '}') braceCount--;
    endIndex++;
  }

  return {
    gName: match[1] || '',
    body: code.substring(startIndex, endIndex - 1)
  };
}

// Java AWT expression evaluator
const evalExpr = (expr, variables, inputs) => {
  if (expr === undefined || expr === null) return 0;
  let cleaned = String(expr).trim();

  const resolveToken = (token) => {
    const trimmed = token.trim();
    if (!trimmed) return '';

    // Check if string literal
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1);
    }

    // Check if AWT textfield value getter (e.g., textField.getText())
    const textfieldGetterMatch = trimmed.match(/^(\w+)\.getText\(\)$/);
    if (textfieldGetterMatch) {
      const name = textfieldGetterMatch[1];
      return inputs[name] !== undefined ? inputs[name] : '';
    }

    // Check if variable in state
    if (variables[trimmed] !== undefined) {
      return variables[trimmed];
    }

    // If it's a number
    if (!isNaN(trimmed)) {
      return Number(trimmed);
    }

    return trimmed;
  };

  // String concatenation or numeric addition
  if (cleaned.includes('+')) {
    const isStringConcat = cleaned.includes('"') || cleaned.includes('getText()') ||
      cleaned.split('+').some(p => {
        const t = p.trim();
        return (t.startsWith('"') && t.endsWith('"')) || t.includes('getText()') || typeof variables[t] === 'string';
      });

    if (isStringConcat) {
      const parts = cleaned.split('+');
      return parts.map(p => resolveToken(p.trim())).join('');
    } else {
      const parts = cleaned.split('+');
      const vals = parts.map(p => Number(resolveToken(p.trim())));
      return vals.reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0);
    }
  }

  // Subtraction (e.g. x - 15)
  if (cleaned.includes('-')) {
    const parts = cleaned.split('-');
    if (parts.length === 2) {
      const v1 = resolveToken(parts[0]);
      const v2 = resolveToken(parts[1]);
      return Number(v1) - Number(v2);
    }
  }

  return resolveToken(cleaned);
};

// Parser to extract components and drawings from Java Applet code
// Parser to extract components and drawings from Java Applet/Frame code
function parseJavaApplet(code) {
  const result = {
    title: 'Applet Viewer',
    backgroundColor: '#ffffff',
    foregroundColor: 'black',
    width: 600,
    height: 500,
    components: [],
    drawings: [],
    variables: {},
    actionPerformed: null,
    hasAnimation: false,
    animationStep: null,
    mouseEvents: {}
  };

  if (!code) return result;

  // 1. Parse Title from comment // Title: ...
  const titleMatch = code.match(/\/\/\s*Title:\s*(.+)/i);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  } else {
    // Parse title from Frame/JFrame constructor or setTitle
    const frameTitleMatch = code.match(/new\s+(?:java\.awt\.)?Frame\(\s*"([^"]+)"\s*\)/) ||
                            code.match(/new\s+(?:javax\.swing\.)?JFrame\(\s*"([^"]+)"\s*\)/) ||
                            code.match(/(?:\w+\.)?setTitle\(\s*"([^"]+)"\s*\)/);
    if (frameTitleMatch) {
      result.title = frameTitleMatch[1];
    } else {
      const classMatch = code.match(/public\s+class\s+(\w+)/);
      if (classMatch) {
        result.title = `Applet Viewer: ${classMatch[1]}`;
      }
    }
  }

  // Parse Width & Height from <applet ... width=... height=...></applet>
  const widthMatch = code.match(/width\s*=\s*["']?(\d+)["']?/i);
  const heightMatch = code.match(/height\s*=\s*["']?(\d+)["']?/i);
  if (widthMatch) result.width = parseInt(widthMatch[1], 10);
  if (heightMatch) result.height = parseInt(heightMatch[1], 10);

  // Parse size from setSize(w, h) or frame.setSize(w, h)
  const sizeMatch = code.match(/(?:\w+\.)?setSize\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (sizeMatch) {
    result.width = parseInt(sizeMatch[1], 10);
    result.height = parseInt(sizeMatch[2], 10);
  }

  // 2. Parse Background Color
  const bgMatch = code.match(/(?:\w+\.)?setBackground\((Color\.\w+|new Color\([\d\s,]+\)|[^)]+)\)/);
  if (bgMatch) {
    const bgVal = bgMatch[1].trim();
    if (bgVal.startsWith('Color.')) {
      result.backgroundColor = bgVal.replace('Color.', '').toLowerCase();
    } else if (bgVal.includes('new Color')) {
      const rgbMatch = bgVal.match(/Color\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
      if (rgbMatch) {
        result.backgroundColor = `rgb(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]})`;
      }
    }
  }

  // Parse Foreground Color
  const fgMatch = code.match(/(?:\w+\.)?setForeground\((Color\.\w+|new Color\([\d\s,]+\)|[^)]+)\)/);
  if (fgMatch) {
    const fgVal = fgMatch[1].trim();
    if (fgVal.startsWith('Color.')) {
      result.foregroundColor = fgVal.replace('Color.', '').toLowerCase();
    } else if (fgVal.includes('new Color')) {
      const rgbMatch = fgVal.match(/Color\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
      if (rgbMatch) {
        result.foregroundColor = `rgb(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]})`;
      }
    }
  }

  // 3. Parse Component declarations and instantiations
  const declarations = [];
  const declRegex = /(?:java\.awt\.|javax\.swing\.)?(Label|TextField|Button|JLabel|JTextField|JButton)\s+([\w\s,]+);/g;
  let match;
  while ((match = declRegex.exec(code)) !== null) {
    let type = match[1];
    if (type === 'JLabel') type = 'Label';
    if (type === 'JTextField') type = 'TextField';
    if (type === 'JButton') type = 'Button';
    const vars = match[2].split(',').map(v => v.trim());
    vars.forEach(v => {
      declarations.push({ type, name: v });
    });
  }

  const componentsMap = {};

  // Find components instantiated with new
  const instRegex = /(\w+)\s*=\s*new\s+(?:java\.awt\.|javax\.swing\.)?(Label|TextField|Button|JLabel|JTextField|JButton)\((.*?)\)/g;
  while ((match = instRegex.exec(code)) !== null) {
    const name = match[1];
    let type = match[2];
    const args = match[3].split(',').map(a => a.trim().replace(/^"|"$/g, ''));

    if (type === 'JLabel') type = 'Label';
    if (type === 'JTextField') type = 'TextField';
    if (type === 'JButton') type = 'Button';

    componentsMap[name] = { name, type, args };
  }

  // Find direct anonymous additions: add(new Label("...")) or jf.add(new Label("..."))
  const anonRegex = /(?:\w+\.)?add\(\s*new\s+(?:java\.awt\.|javax\.swing\.)?(Label|TextField|Button|JLabel|JTextField|JButton)\((.*?)\)\s*\)/g;
  let anonCounter = 0;
  while ((match = anonRegex.exec(code)) !== null) {
    let type = match[1];
    if (type === 'JLabel') type = 'Label';
    if (type === 'JTextField') type = 'TextField';
    if (type === 'JButton') type = 'Button';
    const args = match[2].split(',').map(a => a.trim().replace(/^"|"$/g, ''));
    const name = `anon_${type.toLowerCase()}_${anonCounter++}`;
    componentsMap[name] = {
      name,
      type,
      args,
      isAnonymous: true
    };
    result.components.push(componentsMap[name]);
  }

  // Parse add(varName) statements to order components in the container
  const addRegex = /(?:\w+\.)?add\(\s*(\w+)\s*\)/g;
  while ((match = addRegex.exec(code)) !== null) {
    const name = match[1];
    if (componentsMap[name]) {
      result.components.push(componentsMap[name]);
    }
  }

  // Fallback: if components were declared and instantiated but we didn't find add(varName) 
  // explicitly because of code formatting variations, add them
  Object.keys(componentsMap).forEach(name => {
    if (!componentsMap[name].isAnonymous && !result.components.some(c => c.name === name)) {
      const pattern = new RegExp(`(?:\\w+\\.)?add\\(\\s*${name}\\s*\\)`);
      if (pattern.test(code)) {
        result.components.push(componentsMap[name]);
      }
    }
  });

  // If result.components is still empty, fallback to pushing all instantiated components to be robust
  if (result.components.length === 0) {
    Object.keys(componentsMap).forEach(name => {
      if (!componentsMap[name].isAnonymous) {
        result.components.push(componentsMap[name]);
      }
    });
  }

  // 4. Parse member variables for state (e.g. String message = ""; or int x = 10;)
  const varRegex = /(String|int|double)\s+(\w+)\s*=\s*([^;]+);/g;
  while ((match = varRegex.exec(code)) !== null) {
    const type = match[1];
    const name = match[2];
    let val = match[3].trim();
    if (type === 'String') {
      val = val.replace(/^"|"$/g, '');
    } else {
      val = Number(val);
    }
    result.variables[name] = val;
  }

  // Also catch uninitialized variables with simple defaults
  declarations.forEach(d => {
    if (d.type === 'String' && result.variables[d.name] === undefined) {
      result.variables[d.name] = '';
    } else if ((d.type === 'int' || d.type === 'double') && result.variables[d.name] === undefined) {
      result.variables[d.name] = 0;
    }
  });

  // Parse Mouse Event Handlers
  const parseMouseEventMethod = (methodName) => {
    const sig = new RegExp(`public\\s+void\\s+${methodName}\\s*\\(\\s*MouseEvent\\s+(\\w+)\\s*\\)\\s*\\{`);
    const method = getMethodBody(code, sig);
    if (!method) return null;

    const { gName, body } = method;
    const statements = body.split(';');
    const assignments = [];
    let bgChange = null;

    statements.forEach(stmt => {
      const trimmed = stmt.trim();
      if (!trimmed) return;

      const assignMatch = trimmed.match(/^(\w+)\s*=\s*([\s\S]+)$/);
      if (assignMatch) {
        assignments.push({
          varName: assignMatch[1].trim(),
          expr: assignMatch[2].trim()
        });
      }

      const bgMatch = trimmed.match(/(?:\w+\.)?setBackground\((Color\.\w+|new Color\([\d\s,]+\)|[^)]+)\)/);
      if (bgMatch) {
        bgChange = bgMatch[1].trim();
      }
    });

    return { meVar: gName, assignments, bgChange };
  };

  const mouseMethods = ['mouseEntered', 'mouseExited', 'mousePressed', 'mouseReleased', 'mouseClicked', 'mouseMoved', 'mouseDragged'];
  mouseMethods.forEach(m => {
    const res = parseMouseEventMethod(m);
    if (res) result.mouseEvents[m] = res;
  });

  // 5. Parse paint operations using brace matching helper
  const paintSig = /public\s+void\s+paint\s*\(\s*Graphics\s+(\w+)\s*\)\s*\{/;
  const paintMethod = getMethodBody(code, paintSig);
  if (paintMethod) {
    const { gName, body } = paintMethod;
    const statements = body.split(';');
    let currentColor = result.foregroundColor || 'black';
    let currentFont = '14px sans-serif';

    statements.forEach(stmt => {
      const trimmed = stmt.trim();
      if (!trimmed) return;

      // Color check
      const colorMatch = trimmed.match(new RegExp(`${gName}\\.setColor\\((Color\\\\.\\\\w+|new Color\\\\([\\\\d\\\\s,]+\\\\)|[^)]+)\\)`));
      if (colorMatch) {
        const colVal = colorMatch[1].trim();
        if (colVal.startsWith('Color.')) {
          currentColor = colVal.replace('Color.', '').toLowerCase();
        } else if (colVal.includes('new Color')) {
          const rgb = colVal.match(/Color\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
          if (rgb) {
            currentColor = `rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]})`;
          }
        }
      }

      // Font check
      const fontMatch = trimmed.match(new RegExp(`${gName}\\.setFont\\(([^)]+)\\)`));
      if (fontMatch) {
        const fontVal = fontMatch[1].trim();
        const sizeMatch = fontVal.match(/Font\(\s*"([^"]+)"\s*,\s*.*?\s*,\s*(\d+)\s*\)/);
        if (sizeMatch) {
          const family = sizeMatch[1];
          const size = sizeMatch[2];
          currentFont = `${size}px ${family}`;
        }
      }

      // drawString check (handles string concatenation and commas inside strings)
      const dsMatch = trimmed.match(new RegExp(`${gName}\\.drawString\\(([\\s\\S]*),\\s*([^,]+),\\s*([^,]+)\\)`));
      if (dsMatch) {
        result.drawings.push({
          type: 'drawString',
          textExpr: dsMatch[1].trim(),
          xExpr: dsMatch[2].trim(),
          yExpr: dsMatch[3].trim(),
          color: currentColor,
          font: currentFont
        });
      }

      // fillOval check
      const foMatch = trimmed.match(new RegExp(`${gName}\\.fillOval\\(([^,]+),\\s*([^,]+),\\s*([^,]+),\\s*([^)]+)\\)`));
      if (foMatch) {
        result.drawings.push({
          type: 'fillOval',
          xExpr: foMatch[1].trim(),
          yExpr: foMatch[2].trim(),
          wExpr: foMatch[3].trim(),
          hExpr: foMatch[4].trim(),
          color: currentColor
        });
      }

      // fillRect check
      const frMatch = trimmed.match(new RegExp(`${gName}\\.fillRect\\(([^,]+),\\s*([^,]+),\\s*([^,]+),\\s*([^)]+)\\)`));
      if (frMatch) {
        result.drawings.push({
          type: 'fillRect',
          xExpr: frMatch[1].trim(),
          yExpr: frMatch[2].trim(),
          wExpr: frMatch[3].trim(),
          hExpr: frMatch[4].trim(),
          color: currentColor
        });
      }

      // drawOval check
      const doMatch = trimmed.match(new RegExp(`${gName}\\.drawOval\\(([^,]+),\\s*([^,]+),\\s*([^,]+),\\s*([^)]+)\\)`));
      if (doMatch) {
        result.drawings.push({
          type: 'drawOval',
          xExpr: doMatch[1].trim(),
          yExpr: doMatch[2].trim(),
          wExpr: doMatch[3].trim(),
          hExpr: doMatch[4].trim(),
          color: currentColor
        });
      }

      // drawRect check
      const drMatch = trimmed.match(new RegExp(`${gName}\\.drawRect\\(([^,]+),\\s*([^,]+),\\s*([^,]+),\\s*([^)]+)\\)`));
      if (drMatch) {
        result.drawings.push({
          type: 'drawRect',
          xExpr: drMatch[1].trim(),
          yExpr: drMatch[2].trim(),
          wExpr: drMatch[3].trim(),
          hExpr: drMatch[4].trim(),
          color: currentColor
        });
      }
    });
  }

  // 6. Action listener details using brace matching helper
  const apSig = /public\s+void\s+actionPerformed\s*\(\s*ActionEvent\s+(\w+)\s*\)\s*\{/;
  const apMethod = getMethodBody(code, apSig);
  if (apMethod) {
    const { body } = apMethod;
    const assignRegex = /(\w+)\s*=\s*([^;]+);/g;
    let assMatch;
    const assignments = [];
    while ((assMatch = assignRegex.exec(body)) !== null) {
      const varName = assMatch[1];
      const expr = assMatch[2].trim();
      assignments.push({ varName, expr });
    }
    result.actionPerformed = { assignments };
  }

  // 7. Animation check (implements Runnable)
  if (code.includes('implements Runnable') || code.includes('Thread ')) {
    result.hasAnimation = true;

    // Find variables incremented in run method
    const runSig = /public\s+void\s+run\s*\(\s*\)\s*\{/;
    const runMethod = getMethodBody(code, runSig);
    if (runMethod) {
      const { body } = runMethod;
      const stepMatch = body.match(/(\w+)\s*\+=\s*(\d+)/);
      if (stepMatch) {
        const varName = stepMatch[1];
        const step = Number(stepMatch[2]);

        // Find wrap conditions: if (x > getWidth()) { x = -50; }
        let wrapVal = null;
        let wrapReset = null;
        const wrapMatch = body.match(/if\s*\(\s*(\w+)\s*>\s*([\w()]+)\s*\)\s*\{\s*(\w+)\s*=\s*(-?\d+)\s*;\s*\}/);
        if (wrapMatch && wrapMatch[1] === varName) {
          wrapVal = wrapMatch[2]; // e.g. "getWidth()"
          wrapReset = Number(wrapMatch[4]); // e.g. -50
        }

        result.animationStep = {
          varName,
          step,
          wrapVal,
          wrapReset
        };
      }
    }
  }

  return result;
}

export default function Preview({ code, isRunning, isCompiling, processInfo, exitCode, statusMessage, stopCode }) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [appletBg, setAppletBg] = useState('#ffffff');
  const [appletFg, setAppletFg] = useState('black');

  // Parse code reactively
  const appletData = useMemo(() => parseJavaApplet(code), [code]);

  // Applet variables & inputs states
  const [variables, setVariables] = useState({});
  const [inputs, setInputs] = useState({});

  const isGuiApp = useMemo(() => {
    if (!code) return false;
    return code.includes('extends Applet') || 
           code.includes('extends java.applet.Applet') ||
           code.includes('extends JApplet') || 
           code.includes('extends javax.swing.JApplet') ||
           code.includes('extends Frame') || 
           code.includes('extends java.awt.Frame') ||
           code.includes('extends JFrame') || 
           code.includes('extends javax.swing.JFrame') ||
           code.includes('new Frame') || 
           code.includes('new java.awt.Frame') ||
           code.includes('new JFrame') || 
           code.includes('new javax.swing.JFrame') ||
           code.includes('new Window') ||
           code.includes('new Dialog') ||
           code.includes('new Panel') ||
           code.includes('new JPanel');
  }, [code]);

  const updateScale = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const availableWidth = rect.width - 32;
      const availableHeight = rect.height - 120;

      const scaleW = availableWidth / (appletData.width || 600);
      const scaleH = availableHeight / ((appletData.height || 500) + 50);

      let finalScale = Math.min(scaleW, scaleH);
      if (finalScale > 1) finalScale = 1;
      if (finalScale < 0.3) finalScale = 0.3;
      setScale(finalScale);
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      updateScale();
    });

    observer.observe(containerRef.current);
    updateScale();

    return () => observer.disconnect();
  }, [isGuiApp, isRunning]);

  // Sync state on template load or code modifications
  useEffect(() => {
    if (appletData) {
      setVariables(appletData.variables);
      setAppletBg(appletData.backgroundColor || '#ffffff');
      setAppletFg(appletData.foregroundColor || 'black');
      const initialInputs = {};
      appletData.components.forEach(comp => {
        if (comp.type === 'TextField') {
          // Columns count (e.g. 15) is not text content. Set empty string default.
          initialInputs[comp.name] = comp.args[0] && !isNaN(comp.args[0]) ? '' : (comp.args[0] || '');
        }
      });
      setInputs(initialInputs);
    }
  }, [appletData]);

  // Running elapsed time timer
  useEffect(() => {
    let timer;
    if (isRunning) {
      setElapsedTime(0);
      timer = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timer);
    }
    return () => clearInterval(timer);
  }, [isRunning]);

  // Run Animation Interval loop if Applet implements Runnable & active
  useEffect(() => {
    if (!isRunning || !appletData.hasAnimation || !appletData.animationStep) return;

    const { varName, step, wrapVal, wrapReset } = appletData.animationStep;

    const interval = setInterval(() => {
      setVariables(prev => {
        let val = (prev[varName] !== undefined ? prev[varName] : 0) + step;

        // Wrap around logic. Virtual screen width: 440px
        const widthLimit = 440;
        if (wrapVal === 'getWidth()' && val > widthLimit) {
          val = wrapReset !== null ? wrapReset : -50;
        } else if (typeof wrapVal === 'number' && val > wrapVal) {
          val = wrapReset !== null ? wrapReset : 0;
        }

        return {
          ...prev,
          [varName]: val
        };
      });
    }, 50); // 50ms matching Thread.sleep(50)

    return () => clearInterval(interval);
  }, [isRunning, appletData]);

  // Draw graphics on HTML5 Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Clear / Set Background
    const bg = appletBg;
    ctx.fillStyle = bg === 'black' ? '#000000' : (bg === 'white' ? '#ffffff' : bg);
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render each drawing statement
    appletData.drawings.forEach(draw => {
      try {
        ctx.fillStyle = draw.color || 'black';
        ctx.strokeStyle = draw.color || 'black';

        const x = Number(evalExpr(draw.xExpr, variables, inputs));
        const y = Number(evalExpr(draw.yExpr, variables, inputs));

        if (draw.type === 'drawString') {
          const text = String(evalExpr(draw.textExpr, variables, inputs));
          ctx.font = draw.font || '14px sans-serif';
          ctx.fillText(text, x, y);
        } else if (draw.type === 'fillOval') {
          const w = Number(evalExpr(draw.wExpr, variables, inputs));
          const h = Number(evalExpr(draw.hExpr, variables, inputs));
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
          ctx.fill();
        } else if (draw.type === 'fillRect') {
          const w = Number(evalExpr(draw.wExpr, variables, inputs));
          const h = Number(evalExpr(draw.hExpr, variables, inputs));
          ctx.fillRect(x, y, w, h);
        } else if (draw.type === 'drawOval') {
          const w = Number(evalExpr(draw.wExpr, variables, inputs));
          const h = Number(evalExpr(draw.hExpr, variables, inputs));
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
          ctx.stroke();
        } else if (draw.type === 'drawRect') {
          const w = Number(evalExpr(draw.wExpr, variables, inputs));
          const h = Number(evalExpr(draw.hExpr, variables, inputs));
          ctx.strokeRect(x, y, w, h);
        }
      } catch (err) {
        console.warn('Canvas draw statement error:', err);
      }
    });
  }, [appletData, variables, inputs, isCompiling, isRunning, appletBg, appletFg]);

  const getCanvasMouseCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * canvas.height);
    return { x, y };
  };

  const triggerMouseEvent = (eventName, eventObj) => {
    const handler = appletData.mouseEvents && appletData.mouseEvents[eventName];
    if (!handler) return;

    const { meVar, assignments, bgChange } = handler;

    const mouseInputs = {
      ...inputs,
      [`${meVar}.getX()`]: eventObj.x,
      [`${meVar}.getY()`]: eventObj.y,
    };

    setVariables(prev => {
      const newVars = { ...prev };
      assignments.forEach(assign => {
        const { varName, expr } = assign;
        newVars[varName] = evalExpr(expr, prev, mouseInputs);
      });
      return newVars;
    });

    if (bgChange) {
      let nextBg = appletBg;
      if (bgChange.startsWith('Color.')) {
        nextBg = bgChange.replace('Color.', '').toLowerCase();
      } else if (bgChange.includes('new Color')) {
        const rgb = bgChange.match(/Color\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
        if (rgb) {
          nextBg = `rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]})`;
        }
      }
      setAppletBg(nextBg);
    }
  };

  // Handle simulated button click
  const handleButtonClick = (buttonName) => {
    if (!appletData.actionPerformed) return;

    const assignments = appletData.actionPerformed.assignments;
    setVariables(prev => {
      const newVars = { ...prev };
      assignments.forEach(assign => {
        const { varName, expr } = assign;
        const resultVal = evalExpr(expr, prev, inputs);
        newVars[varName] = resultVal;
      });
      return newVars;
    });
  };

  const handleRestartMenu = () => {
    setVariables(appletData.variables);
    const initialInputs = {};
    appletData.components.forEach(comp => {
      if (comp.type === 'TextField') {
        initialInputs[comp.name] = comp.args[0] && !isNaN(comp.args[0]) ? '' : (comp.args[0] || '');
      }
    });
    setInputs(initialInputs);
    setMenuOpen(false);
  };


  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Compile State overlay
  if (isCompiling) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0c101d] p-6 text-center">
        <div className="relative flex items-center justify-center w-24 h-24 mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-blue-950 animate-pulse"></div>
          <div className="absolute inset-0 rounded-full border-t-4 border-blue-500 animate-spin"></div>
          <Coffee size={40} className="text-blue-500 animate-bounce" />
        </div>
        <h3 className="text-lg font-semibold text-slate-100 mb-2">Compiling Java Code</h3>
        <p className="text-sm text-slate-400 text-center max-w-sm mb-4">
          Compiling your class using local JDK 8 compiler (<code className="bg-slate-950/60 px-1.5 py-0.5 rounded text-xs font-mono text-blue-400 border border-slate-800">javac</code>)...
        </p>
        <span className="px-3 py-1 bg-blue-950/40 text-blue-400 text-xs font-semibold rounded-full animate-pulse border border-blue-900/50">
          {statusMessage || "Starting build..."}
        </span>
      </div>
    );
  }

  // 1. RENDER NATIVE JAVA APPLET SIMULATOR
  if (isGuiApp) {
    return (
      <div ref={containerRef} className="w-full h-full bg-gradient-to-br from-slate-900 to-indigo-950 p-6 flex flex-col justify-between text-white overflow-auto">

        {/* Top active state indicator */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <MonitorPlay className="text-blue-400" size={18} />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AWT Simulated Engine</span>
          </div>
          <div>
            {isRunning ? (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-green-500/10 text-green-400 text-[10px] font-bold rounded-full border border-green-500/20 shadow-inner">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping"></span>
                ACTIVE NATIVE RUN (PID: {processInfo?.pid})
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-slate-500/10 text-slate-400 text-[10px] font-bold rounded-full border border-slate-500/20">
                PREVIEW MODE (Stopped)
              </span>
            )}
          </div>
        </div>

        {/* Center: The Simulated Applet Viewer Desktop Window */}
        <div className="flex-1 flex items-center justify-center py-2 relative min-h-0">
          <div
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
              width: `${appletData.width || 600}px`,
              height: `${(appletData.height || 500) + 50}px`
            }}
            className="shadow-2xl rounded-lg bg-slate-900 flex flex-col overflow-hidden border border-slate-800 relative shrink-0"
          >

            {/* Title Bar */}
            <div className="bg-[#1e293b] px-3 py-1.5 flex items-center justify-between text-white select-none shrink-0 border-b border-slate-950">
              <div className="flex items-center gap-1.5">
                {/* Simulated Java coffee cup icon */}
                <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2 21h18v-2H2v2M20 8h-2V5h2v3M16 3H4c-1.1 0-2 .9-2 2v8c0 2.2 1.8 4 4 4h10c2.2 0 4-1.8 4-4V8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM4 5h12v10H4V5z" />
                </svg>
                <span className="text-xs font-sans font-medium text-slate-100 antialiased">
                  {appletData.title}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {/* Windows 11 style controls */}
                <div className="w-2.5 h-[1.5px] bg-slate-400" />
                <div className="w-2 h-2 border border-slate-400" />
                <X size={13} className="text-slate-400 hover:text-red-500 cursor-pointer" onClick={stopCode} />
              </div>
            </div>

            {/* Menu Bar */}
            <div className="bg-[#0f172a] border-b border-slate-950 px-2 py-0.5 text-xs text-slate-300 font-sans select-none shrink-0 flex relative z-30">
              <div
                className="hover:bg-slate-800 hover:text-white px-2 py-0.5 rounded cursor-pointer flex items-center gap-0.5"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                Applet <ChevronDown size={10} />
              </div>
              {menuOpen && (
                <div className="absolute top-6 left-2 w-32 bg-[#1e293b] border border-slate-950 shadow-xl rounded py-1 text-slate-200 font-sans z-50 text-xs">
                  <button onClick={handleRestartMenu} className="w-full text-left px-3 py-1 hover:bg-slate-800 flex items-center gap-1.5">
                    <RotateCcw size={12} /> Restart
                  </button>
                  <button onClick={handleRestartMenu} className="w-full text-left px-3 py-1 hover:bg-slate-800 flex items-center gap-1.5">
                    <Check size={12} /> Reload
                  </button>
                  <button onClick={stopCode} disabled={!isRunning} className="w-full text-left px-3 py-1 hover:bg-slate-800 flex items-center gap-1.5 disabled:opacity-50">
                    <X size={12} /> Stop
                  </button>
                  <div className="h-px bg-slate-800 my-1" />
                  <button onClick={stopCode} className="w-full text-left px-3 py-1 hover:bg-red-950/40 text-red-400 font-semibold flex items-center gap-1.5">
                    <XCircle size={12} /> Close
                  </button>
                </div>
              )}
            </div>

            {/* In-Browser Preview Banner (only shown if not natively running) */}
            {!isRunning && (
              <div className="bg-blue-950/40 border-b border-blue-900/50 px-3 py-1 text-[10px] text-blue-400 flex items-center gap-1.5 shrink-0 select-none">
                <Info size={11} className="text-blue-400 shrink-0" />
                <span>Local Preview Mode. Click <strong>Run</strong> in navbar to compile/execute on desktop.</span>
              </div>
            )}

            {/* Applet Panel Content (FlowLayout AWT Container & Canvas) */}
            <div className="flex-1 relative overflow-hidden flex flex-col" style={{ backgroundColor: appletBg }}>

              {/* FlowLayout Components panel at the top */}
              {appletData.components.length > 0 && (
                <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40 flex flex-wrap items-center justify-start gap-x-3 gap-y-2 shrink-0 z-10 select-none">
                  {appletData.components.map((comp, idx) => {
                    if (comp.type === 'Label') {
                      return (
                        <span key={idx} className="text-[13px] text-slate-200 font-sans">
                          {comp.args[0] || ''}
                        </span>
                      );
                    }
                    if (comp.type === 'TextField') {
                      return (
                        <input
                          key={idx}
                          type="text"
                          className="border border-slate-700 bg-slate-950 text-slate-200 px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:border-blue-500 rounded-sm shadow-[inset_1px_1px_2px_rgba(0,0,0,0.5)]"
                          style={{
                            width: comp.args[0] && !isNaN(comp.args[0]) ? `${Number(comp.args[0]) * 7 + 10}px` : '100px'
                          }}
                          value={inputs[comp.name] || ''}
                          onChange={(e) => setInputs(prev => ({ ...prev, [comp.name]: e.target.value }))}
                        />
                      );
                    }
                    if (comp.type === 'Button') {
                      return (
                        <button
                          key={idx}
                          onClick={() => handleButtonClick(comp.name)}
                          className="px-4 py-0.5 text-xs font-sans text-slate-200 border border-slate-700 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 rounded-sm shadow-[1px_1px_2px_rgba(0,0,0,0.3)] active:shadow-[inset_1px_1px_2px_rgba(0,0,0,0.5)] select-none cursor-pointer"
                          style={{
                            borderStyle: 'outset',
                            borderWidth: '1px'
                          }}
                        >
                          {comp.args[0] || 'Button'}
                        </button>
                      );
                    }
                    return null;
                  })}
                </div>
              )}

              {/* Graphics Drawing Surface (Canvas) */}
              <div className="flex-1 relative min-h-0 bg-transparent">
                <canvas
                  ref={canvasRef}
                  width={appletData.width || 600}
                  height={appletData.height || 500}
                  className="absolute top-0 left-0 w-full h-full"
                  onMouseEnter={(e) => triggerMouseEvent('mouseEntered', getCanvasMouseCoords(e))}
                  onMouseLeave={(e) => triggerMouseEvent('mouseExited', getCanvasMouseCoords(e))}
                  onMouseDown={(e) => triggerMouseEvent('mousePressed', getCanvasMouseCoords(e))}
                  onMouseUp={(e) => triggerMouseEvent('mouseReleased', getCanvasMouseCoords(e))}
                  onClick={(e) => triggerMouseEvent('mouseClicked', getCanvasMouseCoords(e))}
                  onMouseMove={(e) => {
                    const coords = getCanvasMouseCoords(e);
                    if (e.buttons === 1) {
                      triggerMouseEvent('mouseDragged', coords);
                    } else {
                      triggerMouseEvent('mouseMoved', coords);
                    }
                  }}
                />
              </div>
            </div>

            {/* Applet Status Bar */}
            <div className="bg-[#0f172a] border-t border-slate-950 px-3 py-1 text-[11px] text-slate-400 font-sans select-none shrink-0">
              {isRunning ? 'Applet started.' : 'Applet viewer initialized (Stopped).'}
            </div>

          </div>
        </div>

        {/* Bottom Environment Stats Row */}
        <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4 text-slate-300 font-medium shrink-0">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-slate-400" />
            <div className="text-left">
              <span className="text-[10px] text-slate-500 block leading-tight">RUNNING TIME</span>
              <span className="text-xs font-semibold font-mono">{formatTime(elapsedTime)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Cpu size={15} className="text-slate-400" />
            <div className="text-left">
              <span className="text-[10px] text-slate-500 block leading-tight">ENVIRONMENT</span>
              <span className="text-xs font-semibold">JDK 1.8.0 (Native)</span>
            </div>
          </div>
        </div>

      </div>
    );
  }

  // 2. RENDER NATIVE CONSOLE APPLICATION INTERFACE (Not an Applet)
  return (
    <div className="w-full h-full bg-gradient-to-br from-slate-900 to-indigo-950 p-8 flex flex-col justify-between text-white overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-white/10 shadow-inner">
            <Terminal size={24} />
          </div>
          <div className="text-left">
            <span className="text-xs font-medium text-slate-400 tracking-wider uppercase block">NATIVE EXECUTION</span>
            <h2 className="text-lg font-bold tracking-tight">Java Application</h2>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {isRunning ? (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-400 text-xs font-bold rounded-full border border-green-500/20 shadow-inner">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-ping"></span>
              ACTIVE
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-500/10 text-slate-400 text-xs font-bold rounded-full border border-slate-500/20">
              IDLE
            </span>
          )}
          {isRunning && <span className="text-[10px] font-mono text-slate-400">PID: {processInfo?.pid || 'Unknown'}</span>}
        </div>
      </div>

      {/* Main Body */}
      <div className="my-8 flex flex-col items-center text-center">
        <div className="relative mb-6">
          <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 opacity-30 blur animate-pulse"></div>
          <div className="relative w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center border border-white/10">
            <Terminal size={36} className="text-emerald-400" />
          </div>
        </div>

        {isRunning ? (
          <>
            <h3 className="text-base font-semibold mb-2">Console App Running in Background</h3>
            <p className="text-xs text-slate-400 max-w-sm leading-relaxed mb-4">
              Your standard Java program is executing on the server's JVM. Interactive input and output are active.
            </p>
            <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-xl p-4 text-left backdrop-blur-sm">
              <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                <Cpu size={14} className="text-emerald-400" /> Standard Input Active
              </h4>
              <p className="text-[11px] text-slate-400 leading-normal">
                If your program reads input (e.g. using <code className="font-mono text-slate-200">Scanner</code>),
                type into the input field at the bottom of the black <strong>Console</strong> panel and press Enter.
              </p>
            </div>
          </>
        ) : (
          <>
            {exitCode !== null ? (
              <div className="flex flex-col items-center">
                <div className={`p-3 rounded-full mb-3 ${exitCode === 0 ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                  {exitCode === 0 ? <Check size={28} /> : <AlertCircle size={28} />}
                </div>
                <h3 className="text-base font-semibold mb-1">
                  {exitCode === 0 ? 'Execution Terminated' : 'Program Crashed'}
                </h3>
                <p className="text-xs text-slate-400 mb-2">
                  Process exited with code <span className="font-mono font-bold">{exitCode}</span>.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <h3 className="text-base font-semibold mb-2">Local JVM Execution Panel</h3>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-4">
                  Ready to compile and run your standard Java console code using JDK 1.8.0.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer statistics */}
      <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4 text-slate-300 font-medium shrink-0">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-slate-400" />
          <div className="text-left">
            <span className="text-[10px] text-slate-500 block leading-tight">RUNNING TIME</span>
            <span className="text-xs font-semibold font-mono">{formatTime(elapsedTime)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-slate-400" />
          <div className="text-left">
            <span className="text-[10px] text-slate-500 block leading-tight">ENVIRONMENT</span>
            <span className="text-xs font-semibold">JDK 1.8.0 (Native)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
