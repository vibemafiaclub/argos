const { exec, spawn } = require('child_process');
const url = 'http://example.com/"&echo INJECTED&"';

console.log('Testing exec...');
exec(`echo "start \\"\\" \\"${url}\\""`, (err, stdout) => {
  console.log('exec out:', stdout);
});

console.log('Testing spawn...');
const p = spawn('echo', ['start', '""', url]);
p.stdout.on('data', d => console.log('spawn out:', d.toString()));
