#!/bin/bash
# Stock Analyzer — Package into a standalone desktop application
# Creates a self-contained app in dist/StockAnalyzer-linux-x64/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

export PATH="$HOME/.local/node/bin:$HOME/.local/jdk/bin:$HOME/.local/bin:$PATH"

echo "========================================"
echo "  Packaging Stock Analyzer"
echo "========================================"
echo ""

# 1. Build C++ backend
echo "Building C++ backend..."
cd "$PROJECT_DIR"
make 2>&1 || true
echo "Build done."
echo ""

# 2. Compile Java
echo "Compiling Java..."
mkdir -p build/java
javac -d build/java src/java/src/analyzer/*.java
echo ""

# 3. Prepare a staging area for the Electron app
echo "Preparing application bundle..."
STAGE="$PROJECT_DIR/src/electron/app-bundle"
rm -rf "$STAGE"
mkdir -p "$STAGE"

# Copy Electron entry point
cp "$PROJECT_DIR/src/electron/main.js" "$STAGE/"
cp "$PROJECT_DIR/src/electron/package.json" "$STAGE/"

# Copy the entire backend into the bundle
mkdir -p "$STAGE/backend"
cp "$PROJECT_DIR/build/stock_analyzer" "$STAGE/backend/"
cp -r "$PROJECT_DIR/build/frontend" "$STAGE/backend/frontend"
cp -r "$PROJECT_DIR/build/python" "$STAGE/backend/python"
cp -r "$PROJECT_DIR/build/java" "$STAGE/backend/java"

# Update main.js to find backend relative to itself inside the bundle
cat > "$STAGE/main.js" << 'MAINEOF'
const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

app.disableHardwareAcceleration();

const PORT = 8089;
let serverProcess = null;
let mainWindow = null;

function getServerPath() {
    return path.join(__dirname, 'backend', 'stock_analyzer');
}

function getServerCwd() {
    return path.join(__dirname, 'backend');
}

function startServer() {
    const serverPath = getServerPath();
    const cwd = getServerCwd();
    console.log('Starting C++ backend:', serverPath);
    console.log('Working directory:', cwd);

    serverProcess = spawn(serverPath, ['--headless'], {
        cwd: cwd,
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
                if (res.statusCode === 200) resolve();
                else retry();
            });
            req.on('error', () => retry());
            req.setTimeout(1000, () => { req.destroy(); retry(); });
        }
        function retry() {
            if (attempts >= maxAttempts) reject(new Error('Server did not start in time'));
            else setTimeout(check, 300);
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
        webPreferences: { nodeIntegration: false, contextIsolation: true },
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
        setTimeout(() => mainWindow.loadURL(`http://127.0.0.1:${PORT}`), 1000);
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http') && !url.includes('127.0.0.1')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    mainWindow.on('closed', () => { mainWindow = null; });
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
    if (serverProcess) serverProcess.kill('SIGTERM');
    app.quit();
});

app.on('before-quit', () => {
    if (serverProcess) serverProcess.kill('SIGTERM');
});
MAINEOF

echo ""

# 4. Package with electron-packager
echo "Packaging application (this may take a minute)..."
cd "$PROJECT_DIR/src/electron"
npx @electron/packager "$STAGE" "StockAnalyzer" \
    --platform=linux \
    --arch=x64 \
    --out="$PROJECT_DIR/dist" \
    --overwrite \
    --no-prune \
    --asar=false \
    --extra-resource="$STAGE/backend"

# Clean staging
rm -rf "$STAGE"

echo ""

# 5. Create a launch script inside the dist
DIST_DIR="$PROJECT_DIR/dist/StockAnalyzer-linux-x64"
cat > "$DIST_DIR/launch.sh" << 'LAUNCHEOF'
#!/bin/bash
# Stock Analyzer — Packaged App Launcher
# On WSL2: starts backend in WSL, opens a native Windows app window
# On Linux: launches via Electron

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$DIR/resources/app/backend/stock_analyzer"

export PATH="$HOME/.local/jdk/bin:$HOME/.local/bin:$PATH"
unset ELECTRON_RUN_AS_NODE

# ---- Detect WSL ----
IS_WSL=false
if grep -qi "microsoft" /proc/version 2>/dev/null; then
    IS_WSL=true
fi

# ---- Helper: launch a Windows browser window in app mode ----
launch_windows_window() {
    local url="$1"
    local EDGE1="/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
    local EDGE2="/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe"
    local CHROME1="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
    local CHROME2="/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"

    for browser in "$EDGE1" "$EDGE2" "$CHROME1" "$CHROME2"; do
        if [ -f "$browser" ]; then
            "$browser" "--app=$url" "--window-size=1320,880" &>/dev/null &
            return 0
        fi
    done

    if command -v powershell.exe &>/dev/null; then
        powershell.exe -Command "Start-Process 'msedge' '--app=$url --window-size=1320,880'" &>/dev/null
        return 0
    fi

    cmd.exe /c start "$url" &>/dev/null
    echo "Note: opened in browser tab. For a standalone window, install Microsoft Edge."
}

# ---- WSL mode ----
if $IS_WSL; then
    echo "WSL detected — launching Stock Analyzer as a Windows application."
    echo ""

    "$BACKEND" --headless &
    BACKEND_PID=$!

    echo "Starting backend..."
    for i in $(seq 1 40); do
        if (echo > /dev/tcp/localhost/8089) 2>/dev/null; then
            echo "Backend ready."
            break
        fi
        if ! kill -0 $BACKEND_PID 2>/dev/null; then
            echo "Backend crashed on startup."
            exit 1
        fi
        sleep 0.25
    done

    echo "Opening application window..."
    launch_windows_window "http://localhost:8089"

    echo ""
    echo "Stock Analyzer is running at http://localhost:8089"
    echo "Press Ctrl+C to stop."
    echo ""

    trap "echo ''; echo 'Shutting down...'; kill $BACKEND_PID 2>/dev/null; exit 0" INT TERM
    wait $BACKEND_PID
    exit 0
fi

# ---- Native Linux mode: use Electron ----
exec "$DIR/StockAnalyzer" --no-sandbox --ozone-platform=x11 --disable-gpu "$@"
LAUNCHEOF
chmod +x "$DIST_DIR/launch.sh"

# Create .desktop file
cat > "$DIST_DIR/StockAnalyzer.desktop" << DESKTOPEOF
[Desktop Entry]
Name=Stock Analyzer
Comment=Beginner-friendly stock analysis dashboard
Exec="$DIST_DIR/launch.sh"
Type=Application
Terminal=false
Categories=Finance;Office;
StartupWMClass=StockAnalyzer
DESKTOPEOF
chmod +x "$DIST_DIR/StockAnalyzer.desktop"

# Install .desktop file for the user
mkdir -p "$HOME/.local/share/applications"
cp "$DIST_DIR/StockAnalyzer.desktop" "$HOME/.local/share/applications/"

echo "========================================"
echo "  Packaging complete!"
echo "========================================"
echo ""
echo "  Application location:"
echo "    $DIST_DIR/"
echo ""
echo "  To run:"
echo "    $DIST_DIR/launch.sh"
echo ""
echo "  Desktop shortcut installed to:"
echo "    ~/.local/share/applications/StockAnalyzer.desktop"
echo ""
echo "  You can also double-click StockAnalyzer.desktop"
echo ""
