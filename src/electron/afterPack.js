// electron-builder afterPack hook
//   macOS: wraps the Electron binary with a shell script that strips ELECTRON_RUN_AS_NODE.
//   Linux: sets +x on bundled Python binaries.
//   Windows: no-op (Electron main.js spawns python.exe directly).

const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
    const platform = context.electronPlatformName;
    if (platform === 'darwin') handleMacOS(context);
    else if (platform === 'linux') handleLinux(context);
};

function handleMacOS(context) {
    const appName = context.packager.appInfo.productFilename;
    const macosDir = path.join(context.appOutDir, `${appName}.app`, 'Contents', 'MacOS');
    const binaryPath = path.join(macosDir, appName);
    const realBinaryPath = path.join(macosDir, `${appName}-real`);

    fs.renameSync(binaryPath, realBinaryPath);

    const wrapper = `#!/bin/bash
unset ELECTRON_RUN_AS_NODE
exec "$(dirname "$0")/${appName}-real" "$@"
`;
    fs.writeFileSync(binaryPath, wrapper, { mode: 0o755 });
    console.log(`  afterPack: wrapped ${appName} binary to strip ELECTRON_RUN_AS_NODE`);
}

function handleLinux(context) {
    const resourcesDir = path.join(context.appOutDir, 'resources');
    const pythonBin = path.join(resourcesDir, 'backend', 'python-env', 'bin');

    if (fs.existsSync(pythonBin)) {
        for (const file of fs.readdirSync(pythonBin)) {
            const filePath = path.join(pythonBin, file);
            try { fs.chmodSync(filePath, 0o755); } catch (e) { /* skip dirs */ }
        }
        console.log('  afterPack: set +x on bundled Python binaries');
    }
}
