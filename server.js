const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIRECTORY = path.join(__dirname, 'public');
const DATA_DIRECTORY = path.join(__dirname, 'data');
const FAMILY_DATA_FILE = path.join(DATA_DIRECTORY, 'family-data.json');
const MAX_REQUEST_SIZE = 1024 * 1024;
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, fileContent) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(error.code === 'ENOENT' ? 'Stránka nebyla nalezena.' : 'Server nemohl načíst soubor.');
      return;
    }

    response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
    response.end(fileContent);
  });
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(data === undefined ? '' : JSON.stringify(data));
}

function escapeCalendarText(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function formatCalendarDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}00`;
}

async function sendCalendarFeed(response, memberKey) {
  try {
    let familyData = { events: [], members: {}, settings: { householdName: 'FamilyTimes' } };
    try { familyData = JSON.parse(await fs.promises.readFile(FAMILY_DATA_FILE, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const events = (familyData.events || []).filter((event) => !memberKey || memberKey === 'all' || event.member === memberKey);
    const calendarName = memberKey && memberKey !== 'all' && familyData.members[memberKey] ? `${familyData.members[memberKey].name} · FamilyTimes` : familyData.settings.householdName;
    const calendarLines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FamilyTimes//Rodinny kalendar//CS', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escapeCalendarText(calendarName)}`];
    events.forEach((event) => {
      const eventStart = new Date(`${event.date}T${event.time}:00`);
      const eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000);
      const member = familyData.members[event.member];
      calendarLines.push('BEGIN:VEVENT', `UID:${event.id}@familytimes`, `DTSTAMP:${formatCalendarDate(new Date())}`, `DTSTART:${formatCalendarDate(eventStart)}`, `DTEND:${formatCalendarDate(eventEnd)}`, `SUMMARY:${escapeCalendarText(event.title)}`, `LOCATION:${escapeCalendarText(event.location)}`, `DESCRIPTION:${escapeCalendarText(member ? `Člen rodiny: ${member.name}` : '')}`, 'END:VEVENT');
    });
    calendarLines.push('END:VCALENDAR');
    response.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="familytimes.ics"', 'Cache-Control': 'no-cache' });
    response.end(`${calendarLines.join('\r\n')}\r\n`);
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Kalendář se nepodařilo vytvořit.');
  }
}

async function handleApiRequest(request, response) {
  if (request.method === 'GET') {
    try {
      const storedData = await fs.promises.readFile(FAMILY_DATA_FILE, 'utf8');
      sendJson(response, 200, JSON.parse(storedData));
    } catch (error) {
      if (error.code === 'ENOENT') sendJson(response, 204);
      else sendJson(response, 500, { error: 'Rodinná data se nepodařilo načíst.' });
    }
    return;
  }

  if (request.method === 'PUT') {
    let requestBody = '';
    let requestTooLarge = false;
    request.on('data', (chunk) => {
      if (requestTooLarge) return;
      requestBody += chunk;
      if (Buffer.byteLength(requestBody) > MAX_REQUEST_SIZE) {
        requestTooLarge = true;
        requestBody = '';
      }
    });
    request.on('end', async () => {
      if (requestTooLarge) {
        sendJson(response, 413, { error: 'Požadavek je příliš velký.' });
        return;
      }
      try {
        const familyData = JSON.parse(requestBody);
        if (!familyData || !Array.isArray(familyData.events) || !Array.isArray(familyData.tasks) || typeof familyData.members !== 'object') {
          sendJson(response, 400, { error: 'Neplatný formát rodinných dat.' });
          return;
        }
        await fs.promises.mkdir(DATA_DIRECTORY, { recursive: true });
        const temporaryFile = `${FAMILY_DATA_FILE}.tmp`;
        await fs.promises.writeFile(temporaryFile, JSON.stringify(familyData, null, 2), 'utf8');
        await fs.promises.rename(temporaryFile, FAMILY_DATA_FILE);
        sendJson(response, 200, { saved: true });
      } catch {
        sendJson(response, 400, { error: 'Data se nepodařilo uložit.' });
      }
    });
    return;
  }

  response.writeHead(405, { Allow: 'GET, PUT', 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: 'Nepodporovaná metoda.' }));
}

function handleRequest(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  if (requestUrl.pathname === '/calendar.ics' && request.method === 'GET') {
    sendCalendarFeed(response, requestUrl.searchParams.get('member'));
    return;
  }
  if (requestUrl.pathname === '/api/family-data') {
    handleApiRequest(request, response);
    return;
  }
  const requestedPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIRECTORY, normalizedPath);

  if (!filePath.startsWith(PUBLIC_DIRECTORY)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Přístup odepřen.');
    return;
  }

  sendFile(response, filePath);
}

http.createServer(handleRequest).listen(PORT, () => {
  console.log(`FamilyTimes běží na http://localhost:${PORT}`);
});
