// Prevent ELECTRON_RUN_AS_NODE from being inherited (e.g. from VS Code terminals).
// Must happen before requiring electron, otherwise the 'app' object is undefined.
delete process.env.ELECTRON_RUN_AS_NODE;

const { app, BrowserWindow, shell } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');

const PORT = 8089;
const IS_WIN = process.platform === 'win32';
const PATH_SEP = IS_WIN ? ';' : ':';

let serverProcess = null;
let mainWindow = null;

// In packaged mode, resources are in Contents/Resources/backend/.
// In dev mode, they're in ../../build/.
function getBackendDir() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'backend');
    }
    return path.join(__dirname, '..', '..', 'build');
}

function startServer() {
    const backendDir = getBackendDir();
    const binaryName = IS_WIN ? 'stock_analyzer.exe' : 'stock_analyzer';
    const serverPath = path.join(backendDir, binaryName);
    const hasFastAPI = fs.existsSync(path.join(backendDir, 'api', 'main.py'));

    console.log('Starting backend:', serverPath);
    console.log('Backend dir:', backendDir);

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

    // Prepend bundled runtimes to PATH (packaged mode) plus user local tools
    const extraPaths = [];
    if (IS_WIN) {
        extraPaths.push(path.join(backendDir, 'python-env'));
        extraPaths.push(path.join(backendDir, 'python-env', 'Scripts'));
        extraPaths.push(path.join(backendDir, 'jre', 'bin'));
    } else {
        extraPaths.push(path.join(backendDir, 'python-env', 'bin'));
        extraPaths.push(path.join(backendDir, 'jre', 'bin'));
        extraPaths.push(`${process.env.HOME}/.local/jdk/bin`);
        extraPaths.push(`${process.env.HOME}/.local/bin`);
    }
    cleanEnv.PATH = extraPaths.join(PATH_SEP) + PATH_SEP + (cleanEnv.PATH || '');

    // Decide which backend to launch
    if (fs.existsSync(serverPath)) {
        // Native C++ backend
        serverProcess = spawn(serverPath, ['--headless'], {
            cwd: backendDir,
            env: cleanEnv,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } else if (hasFastAPI) {
        // FastAPI Python backend fallback (Windows without native binary)
        const pythonExe = IS_WIN
            ? path.join(backendDir, 'python-env', 'python.exe')
            : path.join(backendDir, 'python-env', 'bin', 'python3');

        serverProcess = spawn(pythonExe, [
            '-m', 'uvicorn', 'main:app',
            '--host', '127.0.0.1',
            '--port', String(PORT),
            '--log-level', 'warning',
        ], {
            cwd: path.join(backendDir, 'api'),
            env: cleanEnv,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } else {
        console.error('No backend found! Neither stock_analyzer nor api/main.py exists in', backendDir);
        return;
    }

    serverProcess.stdout.on('data', (data) => {
        console.log(`[server] ${data.toString().trim()}`);
    });

    serverProcess.stderr.on('data', (data) => {
        console.error(`[server] ${data.toString().trim()}`);
    });

    serverProcess.on('error', (err) => {
        console.error('Failed to start server:', err.message);
    });

    serverProcess.on('exit', (code) => {
        console.log(`Server exited with code ${code}`);
        serverProcess = null;
    });
}

function waitForServer(maxAttempts = 30) {
    return new Promise((resolve, reject) => {
        let attempts = 0;

        function check() {
            attempts++;
            const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    retry();
                }
            });

            req.on('error', () => retry());
            req.setTimeout(1000, () => {
                req.destroy();
                retry();
            });
        }

        function retry() {
            if (attempts >= maxAttempts) {
                reject(new Error('Server did not start in time'));
            } else {
                setTimeout(check, 300);
            }
        }

        check();
    });
}

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

    mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

    mainWindow.webContents.on('did-finish-load', () => {
        console.log('Page loaded successfully');
        mainWindow.show();
        mainWindow.focus();
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Page failed to load:', errorCode, errorDescription);
        setTimeout(() => {
            mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
        }, 1000);
    });

    // Open external links in default browser
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

function killServer() {
    if (!serverProcess) return;

    if (IS_WIN) {
        // On Windows, SIGTERM doesn't work reliably. Kill the process tree.
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
    startServer();

    try {
        console.log('Waiting for backend...');
        await waitForServer();
        console.log('Backend ready. Opening window.');
        createWindow();
    } catch (err) {
        console.error(err.message);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    killServer();
    app.quit();
});

app.on('before-quit', () => {
    killServer();
});
