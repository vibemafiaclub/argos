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

  if (process.platform === 'darwin') {
    spawn('open', [safeUrl], { stdio: 'ignore' }).unref();
  } else if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '""', safeUrl.replace(/&/g, '^&')], {
      windowsVerbatimArguments: true,
      stdio: 'ignore'
    }).unref();
  } else {
    spawn('xdg-open', [safeUrl], { stdio: 'ignore' }).unref();
  }
}

openBrowser('http://example.com/a?b=c&d=e');
console.log('Opened browser without blocking.');
