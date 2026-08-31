const http = require('http');

http.createServer((req, res) => {
  if (req.url === '/objects' && req.method === 'GET') {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('file1.txt\nfile2.jpg\n');
  } else if (req.url.startsWith('/objects/') && req.method === 'HEAD') {
    res.writeHead(200, {
      'Content-Length': '1024',
      'Content-Type': 'image/jpeg',
      'Last-Modified': new Date().toUTCString()
    });
    res.end();
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(9000, () => console.log('Mock server on 9000'));
