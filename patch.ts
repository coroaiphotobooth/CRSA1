import fs from 'fs';
let content = fs.readFileSync('pages/booths/photobooth/admin/AdminInteractiveTab.tsx', 'utf8');

const targetStr = "} else if (activeConfigPage === 'capture') {";
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("} else if (activeConfigPage === 'capture') {")) {
     // Expected to remove ONE </div>. Let's just hardcode the replacement for these exact lines.
     // i-5:                  )}
     // i-4:               </div>
     // i-3:              </div>
     // i-2:          </div>
     // i-1:       </div>
     // i:       );
     // i+1: } else if ...
     console.log("Removing one </div>");
     lines.splice(i-4, 1);
     break;
  }
}

fs.writeFileSync('pages/booths/photobooth/admin/AdminInteractiveTab.tsx', lines.join('\n'));
console.log("Done");
