// electron-builder afterPack hook
//   Linux: sets +x on bundled Python binaries.
//   macOS / Windows: no-op. main.js deletes ELECTRON_RUN_AS_NODE before
//   requiring electron, so no binary wrapping is needed.

const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
    if (context.electronPlatformName === 'linux') handleLinux(context);
};

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
