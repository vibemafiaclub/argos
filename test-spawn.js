const { spawn } = require('child_process');
const url = 'http://example.com/$(whoami)';

function openBrowser(url) {
  if (process.platform === 'darwin') {
    spawn('echo', ['open', url]);
  } else if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '""', url]);
  } else {
    spawn('echo', ['xdg-open', url]);
  }
}

openBrowser(url);
