'use strict';

/**
 * Request handler — built on `node:http` primitives, zero web dependencies.
 *
 * Exports a single `handler(req, res)` function so the SAME code runs both
 * locally (server.js wraps it in http.createServer) and on Vercel (api/index.js
 * exports it directly as a serverless function).
 *
 * Sessions are stateless signed cookies (HMAC-SHA256), which suits serverless
 * where there is no shared in-process session store.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const querystring = require('node:querystring');

const store = require('./db');
const views = require('./views');

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me';
const COOKIE_NAME = 'sp_session';
const SECURE_COOKIE = !!process.env.VERCEL;

// ---------- signed session cookie helpers ----------

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function makeSessionCookie(userId) {
  const value = String(userId);
  const token = `${value}.${sign(value)}`;
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${24 * 60 * 60}`,
  ];
  if (SECURE_COOKIE) attrs.push('Secure');
  return attrs.join('; ');
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function getUserId(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token || !token.includes('.')) return null;
  const [value, mac] = token.split('.');
  const expected = sign(value);
  // constant-time compare to avoid signature-timing leaks
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return Number(value);
}

// ---------- small response helpers ----------

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function redirect(res, location, cookie) {
  const headers = { Location: location };
  if (cookie) headers['Set-Cookie'] = cookie;
  res.writeHead(302, headers);
  res.end();
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) req.destroy(); // basic body-size guard
    });
    req.on('end', () => resolve(querystring.parse(data)));
    req.on('error', () => resolve({}));
  });
}

// ---------- static file (style.css) ----------

const CSS_PATH = path.join(__dirname, 'public', 'style.css');

function serveCss(res) {
  fs.readFile(CSS_PATH, (err, buf) => {
    if (err) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    res.end(buf);
  });
}

// ---------- main handler ----------

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method;

  const userId = getUserId(req);
  const currentUser = userId ? store.findById(userId) : null;

  // static
  if (method === 'GET' && pathname === '/style.css') return serveCss(res);

  // health check (useful for CI/CD smoke tests)
  if (method === 'GET' && pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', backend: store.backend, time: new Date().toISOString() }));
  }

  // home
  if (method === 'GET' && pathname === '/') {
    return redirect(res, currentUser ? '/profile' : '/login');
  }

  // login
  if (pathname === '/login') {
    if (method === 'GET') {
      if (currentUser) return redirect(res, '/profile');
      return sendHtml(res, 200, views.loginPage({ error: null }));
    }
    if (method === 'POST') {
      const body = await readBody(req);
      const username = (body.username || '').trim();
      const password = body.password || '';
      const student = username ? store.findByUsername(username) : null;
      const ok = student && store.verifyPassword(password, student.password_hash);
      if (!ok) {
        return sendHtml(res, 401, views.loginPage({ error: 'Invalid username or password.' }));
      }
      return redirect(res, '/profile', makeSessionCookie(student.id));
    }
  }

  // logout
  if (pathname === '/logout' && method === 'POST') {
    return redirect(res, '/login', clearSessionCookie());
  }

  // profile (auth required)
  if (pathname === '/profile' && method === 'GET') {
    if (!currentUser) return redirect(res, '/login');
    return sendHtml(res, 200, views.profilePage({ currentUser, student: currentUser }));
  }

  // search (auth required)
  if (pathname === '/search' && method === 'GET') {
    if (!currentUser) return redirect(res, '/login');
    const q = (url.searchParams.get('q') || '').trim();
    const results = q ? store.searchStudents(q) : store.listStudents();
    return sendHtml(res, 200, views.searchPage({ currentUser, q, results }));
  }

  // 404
  return sendHtml(res, 404, views.errorPage({ currentUser, code: 404, message: 'Page not found' }));
}

module.exports = handler;
