const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const appName = 'CVCPHandler.app';
const appPath = path.join(process.cwd(), appName);
const clientScriptPath = path.join(process.cwd(), 'client.js');
const nodePath = process.execPath; // Path to current node executable

// AppleScript to handle the URL
// It runs the client.js script, passing the URL as an argument
const appleScriptContent = `
on open location this_url
    do shell script "${nodePath} '${clientScriptPath}' " & quoted form of this_url & " > /tmp/cvcp.log 2>&1 &"
end open location
`;

const tempScript = path.join(process.cwd(), 'temp_handler.applescript');

console.log("Creating AppleScript handler...");
fs.writeFileSync(tempScript, appleScriptContent);

console.log("Compiling to Application...");
try {
    if (fs.existsSync(appPath)) {
        fs.rmSync(appPath, { recursive: true, force: true });
    }
    execSync(`osacompile -o "${appName}" "${tempScript}"`);
} catch (e) {
    console.error("Failed to compile AppleScript:", e);
    process.exit(1);
}

fs.unlinkSync(tempScript);

console.log("Configuring Info.plist...");
const plistPath = path.join(appPath, 'Contents', 'Info.plist');

try {
    execSync(`plutil -convert xml1 "${plistPath}"`);
    let plistContent = fs.readFileSync(plistPath, 'utf8');

    const urlTypePlist = `
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLName</key>
            <string>Custom Video Call Protocol</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>cvcp</string>
            </array>
        </dict>
    </array>
    <key>LSBackgroundOnly</key>
    <true/>
    `;

    const lastDictIndex = plistContent.lastIndexOf('</dict>');
    if (lastDictIndex !== -1) {
        const newPlistContent = plistContent.slice(0, lastDictIndex) + urlTypePlist + plistContent.slice(lastDictIndex);
        fs.writeFileSync(plistPath, newPlistContent);
    }

    execSync(`plutil -convert binary1 "${plistPath}"`);
} catch (e) {
    console.error("Error modifying Info.plist:", e);
}

console.log("Signing application...");
try {
    execSync(`codesign --force --deep --sign - "${appPath}"`);
} catch (e) {
    console.log("Signing failed (might be okay on some systems):", e.message);
}

console.log(`\nSuccess! ${appName} created.`);
console.log("1. Open Finder: open .");
console.log("2. Double-click CVCPHandler.app to register.");
console.log("3. Run: open cvcp://localhost:9000");
