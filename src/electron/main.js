// Prevent ELECTRON_RUN_AS_NODE from being inherited (e.g. from VS Code terminals).
// Must happen before requiring electron, otherwise the 'app' object is undefined.
delete process.env.ELECTRON_RUN_AS_NODE;

const { app, BrowserWindow, shell } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');

const PORT = 8080;
const IS_WIN = process.platform === 'win32';
const PATH_SEP = IS_WIN ? ';' : ':';

let serverProcess = null;
let mainWindow = null;

// File logger — writes to %APPDATA%/Stock Analyzer/logs/backend.log on Win,
// ~/Library/Application Support/Stock Analyzer/logs/backend.log on macOS,
// ~/.config/Stock Analyzer/logs/backend.log on Linux. So when the backend
// dies we can actually see what happened.
const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'backend.log');
let logStream = null;
function initLog() {
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' });
        logStream.write(`=== Stock Analyzer launch ${new Date().toISOString()} ===\n`);
        logStream.write(`platform=${process.platform} arch=${process.arch} node=${process.version}\n`);
        logStream.write(`packaged=${app.isPackaged} resourcesPath=${process.resourcesPath}\n`);
        logStream.write(`tmpdir=${os.tmpdir()} cwd=${process.cwd()}\n\n`);
    } catch (e) {
        // If we can't even open the log file, swallow — nothing useful to do.
    }
}
function logLine(s) {
    const line = `[${new Date().toISOString()}] ${s}\n`;
    if (logStream) logStream.write(line);
    console.log(line.trim());
}

function getBackendDir() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'backend');
    }
    return path.join(__dirname, '..', '..', 'build');
}

let serverStderrTail = '';

function startServer() {
    const backendDir = getBackendDir();
    const pythonExe = IS_WIN
        ? path.join(backendDir, 'python-env', 'python.exe')
        : path.join(backendDir, 'python-env', 'bin', 'python3');
    const apiDir = path.join(backendDir, 'api');

    logLine(`backendDir=${backendDir}`);
    logLine(`pythonExe=${pythonExe}`);
    logLine(`apiDir=${apiDir}`);

    if (!fs.existsSync(pythonExe)) {
        logLine(`ERROR: bundled python not found at ${pythonExe}`);
        serverStderrTail = `Bundled Python runtime is missing:\n${pythonExe}`;
        return;
    }
    if (!fs.existsSync(path.join(apiDir, 'main.py'))) {
        logLine(`ERROR: api/main.py not found at ${apiDir}`);
        serverStderrTail = `Backend API is missing:\n${apiDir}`;
        return;
    }

    // Build a clean environment — remove Python/conda variables that
    // interfere with numpy imports in both bundled and system Python.
    const cleanEnv = { ...process.env };
    const poisonKeys = [
        'VIRTUAL_ENV', 'CONDA_PREFIX', 'CONDA_DEFAULT_ENV', 'CONDA_SHLVL',
        'PYTHONHOME', 'PYTHONPATH', '__PYVENV_LAUNCHER__',
    ];
    for (const key of poisonKeys) {
        delete cleanEnv[key];
    }

    const pyBinDir = IS_WIN
        ? [path.join(backendDir, 'python-env'), path.join(backendDir, 'python-env', 'Scripts')]
        : [path.join(backendDir, 'python-env', 'bin')];
    cleanEnv.PATH = pyBinDir.join(PATH_SEP) + PATH_SEP + (cleanEnv.PATH || '');
    // Force unbuffered output so crash tracebacks reach the log immediately.
    cleanEnv.PYTHONUNBUFFERED = '1';

    // SQLite DB must live in a writable location. The backend's CWD sits inside
    // the read-only app bundle (macOS Gatekeeper / AppTranslocation, Program Files
    // on Windows when elevated), so we steer SQLAlchemy to userData instead.
    // SQLAlchemy's sqlite:/// URI wants forward slashes even on Windows.
    const dataDir = app.getPath('userData');
    try {
        fs.mkdirSync(dataDir, { recursive: true });
    } catch (e) {
        logLine(`WARN could not mkdir userData: ${e.message}`);
    }
    const dbFile = path.join(dataDir, 'market_analyst.db').replace(/\\/g, '/');
    cleanEnv.DATABASE_URL = `sqlite:///${dbFile}`;
    logLine(`DATABASE_URL=${cleanEnv.DATABASE_URL}`);

    logLine(`spawning: ${pythonExe} -m uvicorn main:app --port ${PORT}`);
    try {
        serverProcess = spawn(pythonExe, [
            '-u',
            '-m', 'uvicorn', 'main:app',
            '--host', '127.0.0.1',
            '--port', String(PORT),
            '--log-level', 'info',
        ], {
            cwd: apiDir,
            env: cleanEnv,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
    } catch (e) {
        logLine(`spawn threw: ${e.message}`);
        serverStderrTail = `spawn() failed: ${e.message}`;
        return;
    }

    serverProcess.stdout.on('data', (data) => {
        const s = data.toString();
        logLine(`[server] ${s.trim()}`);
    });

    serverProcess.stderr.on('data', (data) => {
        const s = data.toString();
        // Keep the last ~2KB of stderr so we can show it in the error page
        serverStderrTail = (serverStderrTail + s).slice(-2048);
        logLine(`[server] ${s.trim()}`);
    });

    serverProcess.on('error', (err) => {
        logLine(`ERROR spawn-error: ${err.message}`);
        serverStderrTail = (serverStderrTail + '\n' + err.message).slice(-2048);
    });

    serverProcess.on('exit', (code, signal) => {
        logLine(`server exited code=${code} signal=${signal}`);
        serverProcess = null;
    });
}

// Windows Defender scans the bundled python.exe + every imported package
// (numpy, pandas, scikit-learn, uvicorn...) on first launch. On a cold box
// this easily takes 30-60s. Give it 3 minutes before giving up.
function waitForServer(maxAttempts = 360, onProgress) {
    return new Promise((resolve, reject) => {
        let attempts = 0;

        function check() {
            attempts++;
            if (onProgress) onProgress(attempts, maxAttempts);
            const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    retry();
                }
            });

            req.on('error', () => retry());
            req.setTimeout(2000, () => {
                req.destroy();
                retry();
            });
        }

        function retry() {
            if (attempts >= maxAttempts) {
                reject(new Error('Server did not start in time'));
            } else {
                setTimeout(check, 500);
            }
        }

        check();
    });
}

const SPLASH_HTML = `
<!DOCTYPE html>
<html>
<head><style>
  body {
    margin: 0; background: #0f1117; color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100vh; overflow: hidden;
  }
  .logo { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 32px; }
  .logo span { color: #6366f1; }
  .bar-track {
    width: 240px; height: 3px; background: #1e2235; border-radius: 3px; overflow: hidden;
  }
  .bar-fill {
    height: 100%; width: 0%; background: #6366f1; border-radius: 3px;
    animation: fill 1.8s ease-in-out infinite;
  }
  @keyframes fill {
    0% { width: 0%; margin-left: 0; }
    50% { width: 60%; margin-left: 20%; }
    100% { width: 0%; margin-left: 100%; }
  }
  .status { margin-top: 16px; font-size: 12px; color: #6b7280; }
</style></head>
<body>
  <div class="logo">Stock <span>Analyzer</span></div>
  <div class="bar-track"><div class="bar-fill"></div></div>
  <div class="status" id="status">Starting backend server...</div>
</body>
</html>`;

function createWindow() {
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;

    const winW = Math.min(1320, screenW - 100);
    const winH = Math.min(880, screenH - 100);

    mainWindow = new BrowserWindow({
        width: winW,
        height: winH,
        x: Math.round((screenW - winW) / 2),
        y: Math.round((screenH - winH) / 2),
        minWidth: 800,
        minHeight: 600,
        title: 'Stock Analyzer',
        backgroundColor: '#0f1117',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        autoHideMenuBar: true,
        show: true,
    });

    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();

    // Show splash screen immediately while backend starts
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH_HTML)}`);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http') && !url.includes('127.0.0.1')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function loadApp() {
    if (!mainWindow) return;
    mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

    mainWindow.webContents.on('did-fail-load', () => {
        setTimeout(() => {
            if (mainWindow) mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
        }, 1000);
    });
}

function killServer() {
    if (!serverProcess) return;

    if (IS_WIN) {
        try {
            execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: 'ignore' });
        } catch (e) {
            serverProcess.kill();
        }
    } else {
        serverProcess.kill('SIGTERM');
    }
}

app.whenReady().then(async () => {
    initLog();

    // Show window immediately with splash screen
    createWindow();

    // Start backend in parallel
    startServer();

    // Progress callback — update splash status text so the user knows we're
    // still alive during long Defender/Gatekeeper scans on first launch.
    const updateStatus = (attempts) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const seconds = Math.floor(attempts * 0.5);
        let msg = 'Starting backend server...';
        if (seconds >= 60) msg = `Still starting... (${seconds}s — antivirus may be scanning)`;
        else if (seconds >= 25) msg = `Starting backend server... (${seconds}s)`;
        mainWindow.webContents
            .executeJavaScript(`(() => { const el = document.getElementById('status'); if (el) el.textContent = ${JSON.stringify(msg)}; })();`)
            .catch(() => {});
    };

    try {
        await waitForServer(360, updateStatus);
        loadApp();
    } catch (err) {
        logLine(`FATAL: ${err.message}`);
        if (mainWindow) {
            const tail = (serverStderrTail || '(no stderr captured — backend may not have spawned)')
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const logPath = LOG_FILE.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
                `<!DOCTYPE html><html><body style="margin:0;background:#0f1117;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;padding:32px;overflow-y:auto;min-height:100vh;box-sizing:border-box">
                <div style="max-width:760px;margin:0 auto">
                  <h2 style="color:#ef4444;margin-top:0">Backend failed to start</h2>
                  <p style="color:#94a3b8">${err.message}</p>
                  <h3 style="color:#e2e8f0;margin-top:24px;font-size:13px;text-transform:uppercase;letter-spacing:1px">Last output from backend</h3>
                  <pre style="background:#1e2235;border:1px solid #2a3046;border-radius:8px;padding:12px;font-size:12px;color:#cbd5e1;white-space:pre-wrap;word-break:break-word;max-height:320px;overflow:auto">${tail}</pre>
                  <h3 style="color:#e2e8f0;margin-top:24px;font-size:13px;text-transform:uppercase;letter-spacing:1px">Full log</h3>
                  <p style="color:#94a3b8;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#1e2235;border:1px solid #2a3046;border-radius:8px;padding:12px;word-break:break-all">${logPath}</p>
                  <p style="color:#6b7280;font-size:11px;margin-top:24px">Please share the contents of the log file when reporting this issue.</p>
                </div></body></html>`
            )}`);
        }
    }
});

app.on('window-all-closed', () => {
    killServer();
    app.quit();
});

app.on('before-quit', () => {
    killServer();
});
