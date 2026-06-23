const { spawn } = require('child_process');

function openBrowser(url) {
  let safeUrl;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Invalid URL protocol');
    }
    safeUrl = parsed.href;
  } catch (err) {
    console.error('Invalid URL:', url);
    return;
  }

  console.log('Platform:', process.platform);
  console.log('Safe URL:', safeUrl);

  if (process.platform === 'darwin') {
    spawn('echo', ['open', safeUrl]);
  } else if (process.platform === 'win32') {
    spawn('echo', ['cmd.exe', '/c', 'start', '""', safeUrl.replace(/&/g, '^&')]);
  } else {
    spawn('echo', ['xdg-open', safeUrl]);
  }
}

openBrowser('http://example.com/a"b?c=d&e=f');
openBrowser('javascript:alert(1)');
openBrowser('http://example.com/&echo INJECTED');
