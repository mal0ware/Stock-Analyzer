// electron-builder afterPack hook
// Platform-specific post-build adjustments:
//   macOS:   Wraps the Electron binary with a shell script that strips ELECTRON_RUN_AS_NODE.
//   Linux:   Sets executable permissions on bundled binaries.
//   Windows: Writes a launcher batch script for the C++ backend.

const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
    const platform = context.electronPlatformName;

    if (platform === 'darwin') {
        handleMacOS(context);
    } else if (platform === 'linux') {
        handleLinux(context);
    } else if (platform === 'win32') {
        handleWindows(context);
    }
};

function handleMacOS(context) {
    const appName = context.packager.appInfo.productFilename;
    const macosDir = path.join(context.appOutDir, `${appName}.app`, 'Contents', 'MacOS');
    const binaryPath = path.join(macosDir, appName);
    const realBinaryPath = path.join(macosDir, `${appName}-real`);

    // Rename the real binary
    fs.renameSync(binaryPath, realBinaryPath);

    // Write a wrapper script that cleans the environment
    const wrapper = `#!/bin/bash
unset ELECTRON_RUN_AS_NODE
exec "$(dirname "$0")/${appName}-real" "$@"
`;
    fs.writeFileSync(binaryPath, wrapper, { mode: 0o755 });

    console.log(`  • afterPack: wrapped ${appName} binary to strip ELECTRON_RUN_AS_NODE`);
}

function handleLinux(context) {
    const resourcesDir = path.join(context.appOutDir, 'resources');
    const backendBinary = path.join(resourcesDir, 'backend', 'stock_analyzer');
    const pythonBin = path.join(resourcesDir, 'backend', 'python-env', 'bin');
    const jreBin = path.join(resourcesDir, 'backend', 'jre', 'bin');

    // Ensure the C++ backend binary is executable
    if (fs.existsSync(backendBinary)) {
        fs.chmodSync(backendBinary, 0o755);
        console.log('  • afterPack: set +x on stock_analyzer');
    }

    // Ensure bundled Python binaries are executable
    if (fs.existsSync(pythonBin)) {
        for (const file of fs.readdirSync(pythonBin)) {
            const filePath = path.join(pythonBin, file);
            try { fs.chmodSync(filePath, 0o755); } catch (e) { /* skip dirs */ }
        }
        console.log('  • afterPack: set +x on bundled Python binaries');
    }

    // Ensure bundled JRE binaries are executable
    if (fs.existsSync(jreBin)) {
        for (const file of fs.readdirSync(jreBin)) {
            const filePath = path.join(jreBin, file);
            try { fs.chmodSync(filePath, 0o755); } catch (e) { /* skip dirs */ }
        }
        console.log('  • afterPack: set +x on bundled JRE binaries');
    }
}

function handleWindows(context) {
    const resourcesDir = path.join(context.appOutDir, 'resources');
    const backendDir = path.join(resourcesDir, 'backend');

    const nativeBackend = path.join(backendDir, 'stock_analyzer.exe');
    const pyinstallerBackend = path.join(backendDir, 'market-analyst-api', 'market-analyst-api.exe');
    const apiDir = path.join(backendDir, 'api');

    if (fs.existsSync(nativeBackend)) {
        console.log('  • afterPack: native Windows backend found');
    } else if (fs.existsSync(pyinstallerBackend)) {
        console.log('  • afterPack: PyInstaller backend found');
    } else if (fs.existsSync(apiDir)) {
        // Write a launcher script that starts the FastAPI backend using bundled Python
        const launcher = path.join(backendDir, 'start-backend.bat');
        const script = `@echo off
set SCRIPT_DIR=%~dp0
set PATH=%SCRIPT_DIR%python-env;%SCRIPT_DIR%python-env\\Scripts;%SCRIPT_DIR%jre\\bin;%PATH%
cd /d "%SCRIPT_DIR%api"
"%SCRIPT_DIR%python-env\\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8089 --log-level warning
`;
        fs.writeFileSync(launcher, script);
        console.log('  • afterPack: wrote start-backend.bat for FastAPI fallback');
    } else {
        console.warn('  • afterPack: WARNING — no Windows backend found!');
    }

    console.log('  • afterPack: Windows post-processing complete');
}
