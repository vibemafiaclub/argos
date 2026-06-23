const u1 = new URL('http://example.com/"&echo INJECTED&"');
console.log(u1.href);
const u2 = new URL('http://example.com/login?param=1&b=2');
console.log(u2.href);
const u3 = new URL('http://example.com/;echo 1');
console.log(u3.href);
const u4 = new URL('javascript:alert(1)');
console.log(u4.href);
