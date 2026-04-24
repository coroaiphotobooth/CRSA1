const fs = require('fs');
const path = require('path');

const classes = [
    'text', 'bg', 'border', 'border-t', 'border-l', 'from', 'to', 'via', 'ring', 'shadow', 'accent'
];

const targets = [
    'pages/dashboard',
    'pages/booths/photobooth/admin',
    'pages/booths/bartender',
    'pages/GuestbookAi/GuestbookAdmin.tsx',
    'pages/GuestbookAi/GuestbookSettingsTab.tsx',
    'pages/auth',
    'components/DialogProvider.tsx',
    'components/TourProvider.tsx'
];

function revertFile(fullPath) {
    if (!fs.existsSync(fullPath)) return;
    let content = fs.readFileSync(fullPath, 'utf8');
    let newContent = content;
    
    classes.forEach(c => {
        let regex = new RegExp(c + '-glow', 'g');
        newContent = newContent.replace(regex, c + '-[#bc13fe]');
    });

    if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent);
        console.log('Reverted in', fullPath);
    }
}

function processTarget(targetPath) {
    if (!fs.existsSync(targetPath)) return;
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
        fs.readdirSync(targetPath).forEach(file => {
            processTarget(path.join(targetPath, file));
        });
    } else {
        if (targetPath.endsWith('.tsx') || targetPath.endsWith('.ts')) {
            revertFile(targetPath);
        }
    }
}

targets.forEach(processTarget);
