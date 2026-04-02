// electron-builder afterPack hook
// Wraps the Electron binary with a shell script that strips ELECTRON_RUN_AS_NODE.
// This prevents the app from breaking when launched from VS Code terminals or
// other environments that set this variable.

const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
    if (context.electronPlatformName !== 'darwin') return;

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
};
