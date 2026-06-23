const { spawn } = require('child_process');

function openBrowser(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http/https protocols are allowed');
    }
  } catch (e) {
    console.error('Invalid URL:', url);
    return;
  }

  if (process.platform === 'darwin') {
    spawn('open', [url]);
  } else if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')]);
  } else {
    spawn('xdg-open', [url]);
  }
}

openBrowser('http://example.com/a&b=c;echo INJECTED');
openBrowser('javascript:alert(1)');
