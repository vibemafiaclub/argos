const { exec } = require('child_process');
const u = new URL('http://example.com/a&b=c').href;
console.log('URL:', u);
console.log('exec command:', `echo "start \\"\\" \\"${u}\\""`);
