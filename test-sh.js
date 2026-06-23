const { exec } = require('child_process');
const safeUrl = new URL('http://example.com/$(whoami)').href;
console.log('Safe URL:', safeUrl);
exec(`echo "${safeUrl}"`, (err, stdout) => {
  console.log('stdout:', stdout);
});
