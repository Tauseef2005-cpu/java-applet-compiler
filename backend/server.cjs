const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const isHeadless = process.env.HEADLESS === 'true' || process.env.NODE_ENV === 'production' || os.platform() !== 'win32';

let activeProcess = null;
let activeTempDir = null;

function stopActiveProcess() {
    if (activeProcess) {
        try {
            activeProcess.kill('SIGKILL');
        } catch (e) {
            console.error("Failed to kill active process:", e);
        }
        activeProcess = null;
    }
    if (activeTempDir) {
        try {
            fs.rmSync(activeTempDir, { recursive: true, force: true });
        } catch (e) {
            console.error("Failed to clean up temp dir:", e);
        }
        activeTempDir = null;
    }
}

app.use(cors());
app.use(express.json());

function extractClassName(code) {
    const match = code.match(/public\s+class\s+([A-Za-z0-9_]+)/);
    return match ? match[1] : 'Main';
}

function injectMainMethod(code, className) {
    if (code.includes('public static void main')) {
        return code;
    }

    // Check if it's an applet
    if (code.includes('extends Applet') || code.includes('extends JApplet')) {
        const mainMethod = `
    public static void main(String[] args) {
        java.awt.Frame frame = new java.awt.Frame("Applet Viewer: ${className}");
        frame.setLayout(new java.awt.BorderLayout());
        
        java.awt.MenuBar menuBar = new java.awt.MenuBar();
        java.awt.Menu appletMenu = new java.awt.Menu("Applet");
        menuBar.add(appletMenu);
        frame.setMenuBar(menuBar);
        
        final java.awt.Label statusBar = new java.awt.Label("Applet started.");
        frame.add(statusBar, java.awt.BorderLayout.SOUTH);
        
        final ${className} applet = new ${className}();
        
        applet.setStub(new java.applet.AppletStub() {
            public boolean isActive() { return true; }
            public java.net.URL getDocumentBase() { try { return new java.net.URL("file:///"); } catch(Exception e){return null;} }
            public java.net.URL getCodeBase() { try { return new java.net.URL("file:///"); } catch(Exception e){return null;} }
            public String getParameter(String name) { return null; }
            public java.applet.AppletContext getAppletContext() {
                return new java.applet.AppletContext() {
                    public java.applet.AudioClip getAudioClip(java.net.URL url) { return null; }
                    public java.awt.Image getImage(java.net.URL url) { return null; }
                    public java.applet.Applet getApplet(String name) { return applet; }
                    public java.util.Enumeration<java.applet.Applet> getApplets() {
                        java.util.Vector<java.applet.Applet> v = new java.util.Vector<>();
                        v.add(applet);
                        return v.elements();
                    }
                    public void showDocument(java.net.URL url) {}
                    public void showDocument(java.net.URL url, String target) {}
                    public void showStatus(String status) {
                        statusBar.setText(status);
                    }
                    public void setStream(String key, java.io.InputStream stream) throws java.io.IOException {}
                    public java.io.InputStream getStream(String key) { return null; }
                    public java.util.Iterator<String> getStreamKeys() { return java.util.Collections.emptyIterator(); }
                };
            }
            public void appletResize(int width, int height) {
                applet.setSize(width, height);
            }
        });
        
        frame.add(applet, java.awt.BorderLayout.CENTER);
        frame.setExtendedState(java.awt.Frame.MAXIMIZED_BOTH);
        frame.setSize(1024, 768);
        
        applet.init();
        applet.start();
        frame.setVisible(true);
    }`;
        const lastBraceIndex = code.lastIndexOf('}');
        if (lastBraceIndex !== -1) {
            return code.substring(0, lastBraceIndex) + mainMethod + "\n}\n";
        }
    }
    return code;
}

function isGuiCode(code) {
    if (!code) return false;
    const guiRegex = /\b(extends\s+(?:java\.applet\.)?Applet|extends\s+(?:javax\.swing\.)?JApplet|extends\s+(?:java\.awt\.)?Frame|extends\s+(?:javax\.swing\.)?JFrame|new\s+(?:java\.awt\.)?Frame|new\s+(?:javax\.swing\.)?JFrame|new\s+(?:java\.awt\.)?Window|new\s+(?:java\.awt\.)?Dialog|new\s+(?:java\.awt\.)?Panel|new\s+(?:javax\.swing\.)?JPanel)\b/;
    return guiRegex.test(code);
}



app.post('/compile', (req, res) => {
    let { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: "Code is required" });
    }

    const className = extractClassName(code);
    code = injectMainMethod(code, className);

    const tempDir = path.join(os.tmpdir(), `java_compile_${crypto.randomBytes(8).toString('hex')}`);

    fs.mkdirSync(tempDir, { recursive: true });

    const javaFilePath = path.join(tempDir, `${className}.java`);
    const classFilePath = path.join(tempDir, `${className}.class`);

    fs.writeFileSync(javaFilePath, code);

    // Run javac
    exec(`javac ${javaFilePath}`, { timeout: 10000 }, (error, stdout, stderr) => {
        if (error) {
            // Cleanup on error
            fs.rmSync(tempDir, { recursive: true, force: true });
            return res.status(400).json({
                error: stderr || error.message,
                logs: stderr
            });
        }

        try {
            // Read all class files generated in the temp directory
            const files = fs.readdirSync(tempDir);
            const classes = [];

            for (const file of files) {
                if (file.endsWith('.class')) {
                    const classBuffer = fs.readFileSync(path.join(tempDir, file));
                    classes.push({
                        name: file,
                        bytecode: classBuffer.toString('base64')
                    });
                }
            }

            // Clean up
            fs.rmSync(tempDir, { recursive: true, force: true });

            res.json({
                className,
                classes,
                logs: "Compilation successful."
            });
        } catch (err) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            res.status(500).json({ error: "Failed to read compiled class files." });
        }
    });
});

app.post('/stop', (req, res) => {
    stopActiveProcess();
    res.json({ status: "stopped" });
});

app.post('/stdin', (req, res) => {
    const { input } = req.body;
    if (activeProcess && activeProcess.stdin.writable) {
        activeProcess.stdin.write(input + '\n');
        return res.json({ status: "sent" });
    }
    res.status(400).json({ error: "No active process or stdin not writable" });
});

app.post('/run', (req, res) => {
    let { code } = req.body;
    if (!code) {
        return res.status(400).json({ error: "Code is required" });
    }

    console.log("=== /run request received ===");
    // Stop any previous process first
    stopActiveProcess();

    const className = extractClassName(code);
    console.log(`Class name extracted: ${className}`);

    // Create compile/run directory
    const tempDir = path.join(os.tmpdir(), `java_run_${crypto.randomBytes(8).toString('hex')}`);
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`Temp directory created: ${tempDir}`);

    const javaFilePath = path.join(tempDir, `${className}.java`);
    fs.writeFileSync(javaFilePath, code);

    // Set streaming headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendSSE = (data) => {
        console.log(`Sending SSE: ${JSON.stringify(data)}`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendSSE({ type: 'status', text: 'Compiling with JDK 8...' });

    let child = null;
    let isRequestClosed = false;
    const isApplet = code.includes('extends Applet') || code.includes('extends JApplet');
    const isGui = isGuiCode(code);
    console.log(`Is Applet: ${isApplet}, Is GUI: ${isGui}, isHeadless: ${isHeadless}`);

    // Run javac
    console.log(`Running javac on: ${javaFilePath}`);
    exec(`javac ${javaFilePath}`, { timeout: 10000 }, (error, stdout, stderr) => {
        console.log(`javac execution callback. error: ${error ? error.message : 'none'}`);
        if (isRequestClosed) {
            console.log("Request is already closed, cleaning up temp dir and aborting.");
            fs.rmSync(tempDir, { recursive: true, force: true });
            return;
        }

        if (error) {
            console.error(`Compilation error: ${stderr || error.message}`);
            sendSSE({ type: 'error', text: stderr || error.message });
            res.end();
            fs.rmSync(tempDir, { recursive: true, force: true });
            return;
        }

        console.log("Compilation successful!");
        sendSSE({ type: 'status', text: 'Compilation successful.' });

        if (isGui) {
            if (isHeadless) {
                console.log("Running in headless simulation mode...");
                sendSSE({ type: 'status', text: 'GUI App compiled successfully (Headless Simulation Mode).' });
                const mockPid = 99999;
                sendSSE({ type: 'start', pid: mockPid, isApplet: true });

                let isClosed = false;
                const cleanup = () => {
                    if (isClosed) return;
                    isClosed = true;
                    sendSSE({ type: 'exit', code: 0 });
                    try { res.end(); } catch (e) { }
                    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) { }
                    activeProcess = null;
                    activeTempDir = null;
                };

                activeProcess = {
                    kill: () => {
                        cleanup();
                    },
                    stdin: { writable: false }
                };
                activeTempDir = tempDir;
                return;
            }

            if (isApplet) {
                // Write applet HTML container file
                const htmlContent = `<!DOCTYPE html>
<html>
<head><title>Applet Viewer: ${className}</title></head>
<body>
  <applet code="${className}.class" width="800" height="600"></applet>
</body>
</html>`;
                fs.writeFileSync(path.join(tempDir, 'index.html'), htmlContent);
                console.log("Wrote index.html for appletviewer");

                sendSSE({ type: 'status', text: `Launching Applet Viewer on desktop...` });
                console.log("Spawning appletviewer index.html...");
                child = spawn('appletviewer', ['index.html'], { cwd: tempDir });
            } else {
                sendSSE({ type: 'status', text: `Starting Java GUI application...` });
                console.log(`Spawning java ${className} for GUI...`);
                child = spawn('java', [className], { cwd: tempDir });
            }
        } else {
            sendSSE({ type: 'status', text: `Starting Java application...` });
            console.log(`Spawning java ${className}...`);
            child = spawn('java', [className], { cwd: tempDir });
        }

        console.log(`Child spawned. PID: ${child.pid}`);
        activeProcess = child;
        activeTempDir = tempDir;

        sendSSE({ type: 'start', pid: child.pid, isApplet });

        child.stdout.on('data', (data) => {
            console.log(`STDOUT: ${data.toString()}`);
            sendSSE({ type: 'stdout', text: data.toString() });
        });

        child.stderr.on('data', (data) => {
            console.error(`STDERR: ${data.toString()}`);
            sendSSE({ type: 'stderr', text: data.toString() });
        });

        child.on('close', (code) => {
            console.log(`Child closed with code: ${code}`);
            sendSSE({ type: 'exit', code: code !== null ? code : 0 });
            res.end();
            if (activeProcess === child) {
                stopActiveProcess();
            }
        });

        child.on('error', (err) => {
            console.error(`Child process error: ${err.message}`);
            sendSSE({ type: 'error', text: `Failed to start process: ${err.message}` });
            res.end();
            if (activeProcess === child) {
                stopActiveProcess();
            }
        });
    });

    res.on('close', () => {
        console.log("Client response connection closed.");
        isRequestClosed = true;
        if (activeProcess && (activeProcess === child || (isHeadless && isGui && activeProcess.kill))) {
            stopActiveProcess();
        }
    });
});

app.use(express.static(path.join(__dirname, '../frontend/dist')));

app.use((req, res) => {
    res.sendFile(path.resolve(__dirname, '../frontend/dist/index.html'));
});
app.listen(PORT, () => {
    console.log(`Live Compiler backend running on http://localhost:${PORT}`);
});