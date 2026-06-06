'use strict';

/**
 * Tiny server-side HTML rendering — no template engine.
 * `esc()` HTML-escapes every interpolated value to prevent XSS.
 */

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout({ title, currentUser, body }) {
  const nav = currentUser
    ? `<nav class="nav">
         <a href="/profile">My Profile</a>
         <a href="/search">Search</a>
         <span class="who">${esc(currentUser.full_name)}</span>
         <form action="/logout" method="post" class="inline">
           <button type="submit" class="link-btn">Logout</button>
         </form>
       </nav>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/">🎓 Student Portal</a>
    ${nav}
  </header>
  <main class="container">
    ${body}
  </main>
  <footer class="footer">
    <span>Student Portal — minimal demo for DevSecOps illustration</span>
  </footer>
</body>
</html>`;
}

function loginPage({ error } = {}) {
  const alert = error ? `<div class="alert">${esc(error)}</div>` : '';
  const body = `
    <div class="narrow">
      <h1>Sign in</h1>
      <p class="muted">Demo account: <code>alice</code> / <code>Password123!</code></p>
      ${alert}
      <form action="/login" method="post" class="card">
        <label>Username
          <input type="text" name="username" autocomplete="username" required autofocus />
        </label>
        <label>Password
          <input type="password" name="password" autocomplete="current-password" required />
        </label>
        <button type="submit" class="btn">Login</button>
      </form>
    </div>`;
  return layout({ title: 'Login · Student Portal', currentUser: null, body });
}

function profilePage({ currentUser, student }) {
  const row = (label, value) =>
    `<div><span class="label">${esc(label)}</span>${esc(value || '—')}</div>`;
  const body = `
    <h1>My Profile</h1>
    <div class="card">
      <div class="profile-grid">
        ${row('Full name', student.full_name)}
        ${row('Roll no', student.roll_no)}
        ${row('Email', student.email)}
        ${row('Department', student.department)}
        ${row('Year', student.year)}
        ${row('Phone', student.phone)}
        <div class="span-2"><span class="label">Address</span>${esc(student.address || '—')}</div>
        <div class="span-2"><span class="label">Member since</span>${esc(student.created_at || '—')}</div>
      </div>
    </div>`;
  return layout({ title: 'My Profile · Student Portal', currentUser, body });
}

function searchPage({ currentUser, q, results }) {
  const rows = results.length
    ? results
        .map(
          (s) => `<tr>
            <td>${esc(s.full_name)}</td>
            <td>${esc(s.roll_no)}</td>
            <td>${esc(s.department)}</td>
            <td>${esc(s.year)}</td>
            <td>${esc(s.email)}</td>
          </tr>`
        )
        .join('')
    : '<tr><td colspan="5" class="muted">No students found.</td></tr>';

  const countLabel = `${results.length} result${results.length === 1 ? '' : 's'}${q ? ` for “${esc(q)}”` : ''}`;

  const body = `
    <h1>Search Students</h1>
    <form action="/search" method="get" class="searchbar">
      <input type="text" name="q" value="${esc(q)}" placeholder="Name, roll no, department or email…" autofocus />
      <button type="submit" class="btn">Search</button>
    </form>
    <p class="muted">${countLabel}</p>
    <table class="table">
      <thead><tr><th>Name</th><th>Roll No</th><th>Department</th><th>Year</th><th>Email</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  return layout({ title: 'Search · Student Portal', currentUser, body });
}

function errorPage({ currentUser, code, message }) {
  const body = `
    <div class="narrow">
      <h1>${esc(code)}</h1>
      <p class="muted">${esc(message)}</p>
      <a href="/" class="btn">Go home</a>
    </div>`;
  return layout({ title: `${esc(code)} · Student Portal`, currentUser: currentUser || null, body });
}

module.exports = { esc, loginPage, profilePage, searchPage, errorPage };
