const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIRECTORY = path.join(__dirname, 'public');
const DATA_DIRECTORY = process.env.FAMILYTIMES_DATA_DIR || path.join(__dirname, 'data');
const HOUSEHOLDS_DIRECTORY = path.join(DATA_DIRECTORY, 'households');
const AUTH_DATA_FILE = path.join(DATA_DIRECTORY, 'auth.json');
const SESSION_SECRET_FILE = path.join(DATA_DIRECTORY, '.session-secret');
const MAX_REQUEST_SIZE = 1024 * 1024;
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;
const scryptAsync = promisify(crypto.scrypt);
const MIME_TYPES = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml' };
let sessionSecret;
const authenticationAttempts = new Map();

function sendJson(response, statusCode, data, headers = {}) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(data === undefined ? '' : JSON.stringify(data));
}

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, fileContent) => {
    if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(error.code === 'ENOENT' ? 'Stránka nebyla nalezena.' : 'Server nemohl načíst soubor.'); return; }
    response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); response.end(fileContent);
  });
}

async function readJsonFile(filePath, fallbackValue) {
  try { return JSON.parse(await fs.promises.readFile(filePath, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallbackValue; throw error; }
}

async function writeJsonFile(filePath, data) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryFile = `${filePath}.${process.pid}.tmp`;
  await fs.promises.writeFile(temporaryFile, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  await fs.promises.rename(temporaryFile, filePath);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let requestBody = ''; let requestTooLarge = false;
    request.on('data', (chunk) => { if (requestTooLarge) return; requestBody += chunk; if (Buffer.byteLength(requestBody) > MAX_REQUEST_SIZE) { requestTooLarge = true; requestBody = ''; } });
    request.on('end', () => { if (requestTooLarge) { reject(Object.assign(new Error('Příliš velký požadavek.'), { statusCode: 413 })); return; } try { resolve(requestBody ? JSON.parse(requestBody) : {}); } catch { reject(Object.assign(new Error('Neplatný JSON.'), { statusCode: 400 })); } });
    request.on('error', reject);
  });
}

function getSessionSecret() {
  if (sessionSecret) return sessionSecret;
  if (process.env.SESSION_SECRET) { sessionSecret = process.env.SESSION_SECRET; return sessionSecret; }
  fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
  try { sessionSecret = fs.readFileSync(SESSION_SECRET_FILE, 'utf8').trim(); } catch (error) { if (error.code !== 'ENOENT') throw error; sessionSecret = crypto.randomBytes(48).toString('base64url'); fs.writeFileSync(SESSION_SECRET_FILE, sessionSecret, { encoding: 'utf8', mode: 0o600 }); }
  return sessionSecret;
}

function createSessionToken(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  try { const [payload, signature] = token.split('.'); const expectedSignature = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest(); const receivedSignature = Buffer.from(signature, 'base64url'); if (receivedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(receivedSignature, expectedSignature)) return null; const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); return session.expiresAt > Date.now() ? session : null; } catch { return null; }
}

function getCookie(request, cookieName) {
  const cookies = String(request.headers.cookie || '').split(';');
  const cookie = cookies.find((item) => item.trim().startsWith(`${cookieName}=`));
  return cookie ? decodeURIComponent(cookie.trim().slice(cookieName.length + 1)) : '';
}

function createSessionCookie(token, shouldClear = false) {
  const parts = [`familytimes_session=${shouldClear ? '' : encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', shouldClear ? 'Max-Age=0' : `Max-Age=${SESSION_DURATION_SECONDS}`];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const passwordHash = await scryptAsync(password, salt, 64);
  return { salt, hash: passwordHash.toString('hex') };
}

async function verifyPassword(password, salt, storedHash) {
  const { hash } = await hashPassword(password, salt); const expected = Buffer.from(storedHash, 'hex'); const received = Buffer.from(hash, 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function getAuthenticationKey(request, email) { return `${request.socket.remoteAddress || 'unknown'}:${email}`; }
function isAuthenticationLimited(key) { const attempt = authenticationAttempts.get(key); if (!attempt) return false; if (Date.now() - attempt.startedAt > 15 * 60 * 1000) { authenticationAttempts.delete(key); return false; } return attempt.count >= 10; }
function recordAuthenticationFailure(key) { const attempt = authenticationAttempts.get(key); if (!attempt || Date.now() - attempt.startedAt > 15 * 60 * 1000) authenticationAttempts.set(key, { count: 1, startedAt: Date.now() }); else attempt.count += 1; }

async function getAuthenticatedContext(request) {
  const session = verifySessionToken(getCookie(request, 'familytimes_session'));
  if (!session) return null;
  const authData = await readJsonFile(AUTH_DATA_FILE, { users: [], households: [], invitations: [] });
  const user = authData.users.find((item) => item.id === session.userId);
  const household = user && authData.households.find((item) => item.id === user.householdId);
  return user && household ? { user, household } : null;
}

function sanitizeFamilyData(data) {
  if (!data || !Array.isArray(data.events) || !Array.isArray(data.tasks) || !data.members || typeof data.members !== 'object' || Array.isArray(data.members)) throw Object.assign(new Error('Neplatný formát rodinných dat.'), { statusCode: 400 });
  return data;
}

async function handleAuthRequest(request, response, pathname) {
  try {
    if (pathname === '/api/auth/register' && request.method === 'POST') {
      const body = await readRequestBody(request); const email = String(body.email || '').trim().toLowerCase(); const name = String(body.name || '').trim(); const password = String(body.password || ''); const householdName = String(body.householdName || '').trim(); const inviteToken = String(body.inviteToken || '');
      if (!/^\S+@\S+\.\S+$/.test(email) || name.length < 2 || password.length < 8 || (!inviteToken && householdName.length < 2)) { sendJson(response, 400, { error: 'Vyplňte platný e-mail, jméno, domácnost a heslo alespoň 8 znaků.' }); return; }
      const authData = await readJsonFile(AUTH_DATA_FILE, { users: [], households: [], invitations: [] }); authData.invitations ||= [];
      if (authData.users.some((user) => user.email === email)) { sendJson(response, 409, { error: 'Účet s tímto e-mailem už existuje.' }); return; }
      let householdId; let household; let role = 'admin'; let memberId = null;
      if (inviteToken) { const invitation = authData.invitations.find((item) => item.token === inviteToken && !item.usedAt && new Date(item.expiresAt) > new Date()); if (!invitation) { sendJson(response, 400, { error: 'Pozvánka je neplatná nebo vypršela.' }); return; } householdId = invitation.householdId; memberId = invitation.memberId; role = 'member'; invitation.usedAt = new Date().toISOString(); household = authData.households.find((item) => item.id === householdId); }
      else { householdId = crypto.randomUUID(); const calendarToken = crypto.randomBytes(24).toString('base64url'); household = { id: householdId, name: householdName, calendarToken, createdAt: new Date().toISOString() }; authData.households.push(household); }
      const userId = crypto.randomUUID(); const passwordData = await hashPassword(password);
      authData.users.push({ id: userId, householdId, memberId, email, name, role, passwordSalt: passwordData.salt, passwordHash: passwordData.hash, createdAt: new Date().toISOString() });
      await writeJsonFile(AUTH_DATA_FILE, authData);
      if (body.initialData && role === 'admin') await writeJsonFile(path.join(HOUSEHOLDS_DIRECTORY, `${householdId}.json`), sanitizeFamilyData(body.initialData));
      const token = createSessionToken(userId); sendJson(response, 201, { user: { id: userId, email, name, role, memberId }, household: { id: householdId, name: household.name }, calendarToken: household.calendarToken }, { 'Set-Cookie': createSessionCookie(token) }); return;
    }
    if (pathname === '/api/auth/login' && request.method === 'POST') {
      const body = await readRequestBody(request); const email = String(body.email || '').trim().toLowerCase(); const password = String(body.password || ''); const authData = await readJsonFile(AUTH_DATA_FILE, { users: [], households: [], invitations: [] }); const user = authData.users.find((item) => item.email === email);
      const authenticationKey = getAuthenticationKey(request, email); if (isAuthenticationLimited(authenticationKey)) { sendJson(response, 429, { error: 'Příliš mnoho pokusů. Zkuste to znovu za 15 minut.' }); return; }
      if (!user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) { recordAuthenticationFailure(authenticationKey); sendJson(response, 401, { error: 'Nesprávný e-mail nebo heslo.' }); return; }
      authenticationAttempts.delete(authenticationKey);
      const household = authData.households.find((item) => item.id === user.householdId); const token = createSessionToken(user.id); sendJson(response, 200, { user: { id: user.id, email: user.email, name: user.name, role: user.role, memberId: user.memberId }, household: { id: household.id, name: household.name }, calendarToken: household.calendarToken }, { 'Set-Cookie': createSessionCookie(token) }); return;
    }
    if (pathname === '/api/auth/logout' && request.method === 'POST') { sendJson(response, 200, { loggedOut: true }, { 'Set-Cookie': createSessionCookie('', true) }); return; }
    if (pathname === '/api/auth/status' && request.method === 'GET') { const context = await getAuthenticatedContext(request); if (!context) { sendJson(response, 401, { authenticated: false }); return; } sendJson(response, 200, { authenticated: true, user: { id: context.user.id, email: context.user.email, name: context.user.name, role: context.user.role, memberId: context.user.memberId }, household: { id: context.household.id, name: context.household.name }, calendarToken: context.household.calendarToken }); return; }
    sendJson(response, 405, { error: 'Nepodporovaná metoda.' }, { Allow: 'GET, POST' });
  } catch (error) { sendJson(response, error.statusCode || 500, { error: error.statusCode ? error.message : 'Požadavek se nepodařilo zpracovat.' }); }
}

async function handleFamilyDataRequest(request, response) {
  try {
    const context = await getAuthenticatedContext(request); if (!context) { sendJson(response, 401, { error: 'Přihlášení je vyžadováno.' }); return; }
    const familyDataFile = path.join(HOUSEHOLDS_DIRECTORY, `${context.household.id}.json`);
    if (request.method === 'GET') { const familyData = await readJsonFile(familyDataFile, null); sendJson(response, familyData ? 200 : 204, familyData || undefined); return; }
    if (request.method === 'PUT') { const familyData = sanitizeFamilyData(await readRequestBody(request)); if (context.user.role !== 'admin') { const storedData = await readJsonFile(familyDataFile, null); if (!storedData || JSON.stringify(familyData.events) !== JSON.stringify(storedData.events) || JSON.stringify(familyData.members) !== JSON.stringify(storedData.members) || JSON.stringify(familyData.settings) !== JSON.stringify(storedData.settings)) { sendJson(response, 403, { error: 'Tuto změnu může provést pouze správce rodiny.' }); return; } } await writeJsonFile(familyDataFile, familyData); sendJson(response, 200, { saved: true }); return; }
    sendJson(response, 405, { error: 'Nepodporovaná metoda.' }, { Allow: 'GET, PUT' });
  } catch (error) { sendJson(response, error.statusCode || 500, { error: error.statusCode ? error.message : 'Rodinná data se nepodařilo zpracovat.' }); }
}

async function handleInvitationRequest(request, response) {
  try {
    const context = await getAuthenticatedContext(request); if (!context) { sendJson(response, 401, { error: 'Přihlášení je vyžadováno.' }); return; } if (context.user.role !== 'admin') { sendJson(response, 403, { error: 'Pozvánky může vytvářet pouze správce.' }); return; } if (request.method !== 'POST') { sendJson(response, 405, { error: 'Nepodporovaná metoda.' }, { Allow: 'POST' }); return; }
    const body = await readRequestBody(request); const memberId = String(body.memberId || ''); const familyData = await readJsonFile(path.join(HOUSEHOLDS_DIRECTORY, `${context.household.id}.json`), null); if (!familyData || !familyData.members[memberId]) { sendJson(response, 404, { error: 'Člen rodiny nebyl nalezen.' }); return; }
    const authData = await readJsonFile(AUTH_DATA_FILE, { users: [], households: [], invitations: [] }); authData.invitations ||= []; const existingUser = authData.users.find((user) => user.householdId === context.household.id && user.memberId === memberId); if (existingUser) { sendJson(response, 409, { error: 'Tento člen už má vlastní přístup.' }); return; }
    authData.invitations = authData.invitations.filter((invitation) => invitation.usedAt || new Date(invitation.expiresAt) > new Date()); const token = crypto.randomBytes(24).toString('base64url'); const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString(); authData.invitations.push({ token, householdId: context.household.id, memberId, createdBy: context.user.id, expiresAt }); await writeJsonFile(AUTH_DATA_FILE, authData); sendJson(response, 201, { token, expiresAt });
  } catch (error) { sendJson(response, error.statusCode || 500, { error: error.statusCode ? error.message : 'Pozvánku se nepodařilo vytvořit.' }); }
}

function escapeCalendarText(value) { return String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function formatCalendarDate(date) { return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}00`; }

async function sendCalendarFeed(response, memberKey, calendarToken) {
  try {
    const authData = await readJsonFile(AUTH_DATA_FILE, { users: [], households: [] }); const household = authData.households.find((item) => item.calendarToken === calendarToken);
    if (!household) { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Kalendář nebyl nalezen.'); return; }
    const familyData = await readJsonFile(path.join(HOUSEHOLDS_DIRECTORY, `${household.id}.json`), { events: [], members: {}, settings: { householdName: household.name } }); const events = familyData.events.filter((event) => !memberKey || memberKey === 'all' || event.member === memberKey); const calendarName = memberKey && memberKey !== 'all' && familyData.members[memberKey] ? `${familyData.members[memberKey].name} · FamilyTimes` : familyData.settings.householdName; const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FamilyTimes//Rodinny kalendar//CS', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escapeCalendarText(calendarName)}`];
    events.forEach((event) => { const start = new Date(`${event.date}T${event.time}:00`); const end = new Date(start.getTime() + 3600000); const member = familyData.members[event.member]; lines.push('BEGIN:VEVENT', `UID:${event.id}@familytimes`, `DTSTAMP:${formatCalendarDate(new Date())}`, `DTSTART:${formatCalendarDate(start)}`, `DTEND:${formatCalendarDate(end)}`, `SUMMARY:${escapeCalendarText(event.title)}`, `LOCATION:${escapeCalendarText(event.location)}`, `DESCRIPTION:${escapeCalendarText(member ? `Člen rodiny: ${member.name}` : '')}`, 'END:VEVENT'); }); lines.push('END:VCALENDAR'); response.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="familytimes.ics"', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }); response.end(`${lines.join('\r\n')}\r\n`);
  } catch { response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Kalendář se nepodařilo vytvořit.'); }
}

function createServer() {
  return http.createServer((request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    response.setHeader('Referrer-Policy', 'same-origin'); response.setHeader('X-Frame-Options', 'DENY'); response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'); response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (requestUrl.pathname.startsWith('/api/auth/')) { handleAuthRequest(request, response, requestUrl.pathname); return; }
    if (requestUrl.pathname === '/api/invitations') { handleInvitationRequest(request, response); return; }
    if (requestUrl.pathname === '/api/family-data') { handleFamilyDataRequest(request, response); return; }
    if (requestUrl.pathname === '/calendar.ics' && request.method === 'GET') { sendCalendarFeed(response, requestUrl.searchParams.get('member'), requestUrl.searchParams.get('token')); return; }
    const requestedPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname; const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, ''); const filePath = path.join(PUBLIC_DIRECTORY, normalizedPath);
    if (!filePath.startsWith(PUBLIC_DIRECTORY)) { response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Přístup odepřen.'); return; }
    sendFile(response, filePath);
  });
}

if (require.main === module) createServer().listen(PORT, () => console.log(`FamilyTimes běží na http://localhost:${PORT}`));
module.exports = { createServer };
