// electron-builder afterSign hook
//   macOS: deep ad-hoc re-sign the whole bundle so nested binaries
//   (bundled Python interpreter + pip-modified .so files) have signatures
//   that match their current bytes. Without this, Gatekeeper reports
//   "damaged / code does not match the original signed code" because
//   python-build-standalone ships signed Python binaries and pip install
//   rewrites library files after the fact, breaking those signatures.
//   Other platforms: no-op.

const { execSync } = require('child_process');
const path = require('path');

exports.default = async function (context) {
    if (context.electronPlatformName !== 'darwin') return;

    const appName = context.packager.appInfo.productFilename;
    const appPath = path.join(context.appOutDir, `${appName}.app`);

    console.log(`  afterSign: deep ad-hoc re-signing ${appPath}`);
    execSync(
        `codesign --force --deep --sign - "${appPath}"`,
        { stdio: 'inherit' }
    );
    execSync(
        `codesign --verify --deep --strict --verbose=2 "${appPath}"`,
        { stdio: 'inherit' }
    );
};
