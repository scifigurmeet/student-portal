'use strict';

// Local entry point. On Vercel, api/index.js is used instead.
const http = require('node:http');
const handler = require('./app');

const port = process.env.PORT || 3000;

http.createServer(handler).listen(port, () => {
  console.log(`Student Portal running at http://localhost:${port}`);
  console.log('Demo login -> username: alice   password: Password123!');
});
