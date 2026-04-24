const fs = require('fs');

const files = [
    'App.tsx',
    'pages/booths/photobooth/LandingPage.tsx',
    'pages/booths/photobooth/ThemesPage.tsx',
    'pages/booths/photobooth/CameraPage.tsx',
    'pages/booths/photobooth/ResultPage.tsx',
    'pages/booths/photobooth/GuestResultPage.tsx',
    'pages/booths/photobooth/VipLandingPage.tsx',
    'components/CinematicIntro.tsx'
];

files.forEach(file => {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    let origin = content;

    // Replace -purple-XXX with -glow
    content = content.replace(/(text|bg|border|border-t|border-b|border-l|border-r|ring|from|to|via)-purple-[0-9]{3}/g, '$1-glow');
    
    // Replace hardcoded rgba values of purple or bc13fe to rgba(var(--glow-color-rgb), ...)
    // 168,85,247 is Tailwind purple-500
    // 188,19,254 is #bc13fe
    content = content.replace(/rgba\(168,85,247,/g, 'rgba(var(--glow-color-rgb),');
    content = content.replace(/rgba\(188,19,254,/g, 'rgba(var(--glow-color-rgb),');
    
    // Replace hex #a855f7 (purple-500), #bc13fe, #a010d8 (usually used for hover:bg-[#a010d8])
    // Wait, replacing hover:bg-[#a010d8] -> hover:bg-glow/80 is nicer.
    content = content.replace(/hover:bg-\[#a010d8\]/g, 'hover:bg-glow/80');
    content = content.replace(/#a855f7/gi, 'var(--glow-color)');

    if (content !== origin) {
        fs.writeFileSync(file, content);
        console.log(`Updated purples to glow in ${file}`);
    }
});
