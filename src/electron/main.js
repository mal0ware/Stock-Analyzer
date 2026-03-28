const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

// Use software rendering (needed for WSL2, VMs, no-GPU environments)
app.disableHardwareAcceleration();

const PORT = 8089;
let serverProcess = null;
let mainWindow = null;

function getServerPath() {
    return path.join(__dirname, '..', '..', 'build', 'stock_analyzer');
}

function startServer() {
    const serverPath = getServerPath();
    console.log('Starting C++ backend:', serverPath);

    serverProcess = spawn(serverPath, ['--headless'], {
        cwd: path.join(__dirname, '..', '..', 'build'),
        env: {
            ...process.env,
            PATH: `${process.env.HOME}/.local/jdk/bin:${process.env.HOME}/.local/bin:${process.env.PATH}`
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

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

    // Force window visible and focused
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();

    mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

    mainWindow.webContents.on('did-finish-load', () => {
        console.log('Page loaded successfully');
        // Re-force visibility after page loads
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

app.whenReady().then(async () => {
    startServer();

    try {
        console.log('Waiting for C++ backend...');
        await waitForServer();
        console.log('Backend ready. Opening window.');
        createWindow();
    } catch (err) {
        console.error(err.message);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    if (serverProcess) {
        serverProcess.kill('SIGTERM');
    }
    app.quit();
});

app.on('before-quit', () => {
    if (serverProcess) {
        serverProcess.kill('SIGTERM');
    }
});
