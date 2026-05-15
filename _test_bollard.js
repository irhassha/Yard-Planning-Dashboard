const fs = require('fs');
const content = fs.readFileSync('yp.js', 'utf8');

// We need BOLLARD_TABLE and parseBollardToPos
let bollardTableSrc = content.match(/const BOLLARD_TABLE = \[([\s\S]*?)\];/)[0];
let parseSrc = content.match(/function parseBollardToPos[\s\S]*?return null;\s*\}/)[0];

eval(bollardTableSrc);
eval(parseSrc);

console.log("BL02 ->", parseBollardToPos("BL02"));
console.log("9 ->", parseBollardToPos("9"));
console.log("29 ->", parseBollardToPos("29"));
console.log("800 ->", parseBollardToPos("800"));
