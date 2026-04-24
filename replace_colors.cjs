const fs = require('fs');
const path = require('path');

function walkDir(dir) {
    fs.readdirSync(dir).forEach(file => {
        let fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (!fullPath.includes('node_modules') && !fullPath.includes('.git') && !fullPath.includes('dist')) {
                walkDir(fullPath);
            }
        } else {
            if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.html') || fullPath.endsWith('.css') || fullPath.endsWith('.gs')) {
                let content = fs.readFileSync(fullPath, 'utf8');
                let newContent = content.replace(/\[#bc13fe\]/gi, 'glow');
                if (content !== newContent) {
                    fs.writeFileSync(fullPath, newContent);
                    console.log('Modified', fullPath);
                }
            }
        }
    });
}
walkDir('.');
