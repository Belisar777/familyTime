const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'familytimes-test-'));
process.env.FAMILYTIMES_DATA_DIR = testDataDirectory;
process.env.SESSION_SECRET = 'test-secret-that-is-long-and-only-used-for-tests';
const { createServer } = require('../server');

const sampleData = {
  events: [{ id: 1, title: 'Testovací aktivita', member: 'jan', date: '2026-08-26', time: '10:00', location: 'Doma' }],
  tasks: [{ id: 1, title: 'Testovací úkol', member: 'jan', dueDate: '2026-08-26', completed: false }],
  members: { jan: { name: 'Jan Testovací', shortName: 'Jan', initial: 'J', role: 'Správce rodiny', color: 0 } },
  settings: { householdName: 'Testovací rodina', city: 'Praha' },
  updatedAt: '2026-08-26T10:00:00.000Z'
};

let server;
let baseUrl;

test.before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(testDataDirectory, { recursive: true, force: true });
});

test('chrání rodinná data bez přihlášení', async () => {
  const response = await fetch(`${baseUrl}/api/family-data`);
  assert.equal(response.status, 401);
});

test('registruje domácnost, ukládá data a poskytuje kalendář', async () => {
  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Jan Testovací', email: 'jan@example.test', password: 'bezpecneheslo', householdName: 'Testovací rodina', initialData: sampleData })
  });
  assert.equal(registration.status, 201);
  const cookie = registration.headers.get('set-cookie').split(';')[0];
  const registrationData = await registration.json();
  assert.equal(registrationData.user.role, 'admin');

  const status = await fetch(`${baseUrl}/api/auth/status`, { headers: { Cookie: cookie } });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).authenticated, true);

  const familyResponse = await fetch(`${baseUrl}/api/family-data`, { headers: { Cookie: cookie } });
  assert.equal(familyResponse.status, 200);
  assert.deepEqual(await familyResponse.json(), sampleData);

  const changedData = {
    ...sampleData,
    members: {
      ...sampleData.members,
      petra: { name: 'Petra Testovací', shortName: 'Petra', initial: 'P', role: 'Rodič', color: 1 },
      eliska: { name: 'Eliška Testovací', shortName: 'Eliška', initial: 'E', role: 'Dítě', color: 2 },
      tomas: { name: 'Tomáš Testovací', shortName: 'Tomáš', initial: 'T', role: 'Dítě', color: 3 },
      'member-five': { name: 'Anna Testovací', shortName: 'Anna', initial: 'A', role: 'Prarodič', color: 4 },
      'member-six': { name: 'Pavel Testovací', shortName: 'Pavel', initial: 'P', role: 'Pečující osoba', color: 5 }
    },
    settings: { ...sampleData.settings, city: 'Brno' }
  };
  const saveResponse = await fetch(`${baseUrl}/api/family-data`, { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(changedData) });
  assert.equal(saveResponse.status, 200);
  const membersAfterSave = await fetch(`${baseUrl}/api/family-data`, { headers: { Cookie: cookie } });
  assert.equal(Object.keys((await membersAfterSave.json()).members).length, 6);

  const invitationResponse = await fetch(`${baseUrl}/api/invitations`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: 'jan' }) });
  assert.equal(invitationResponse.status, 201);
  const invitation = await invitationResponse.json();
  const memberRegistration = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Jana Testovací', email: 'jana@example.test', password: 'druhebezpecneheslo', inviteToken: invitation.token }) });
  assert.equal(memberRegistration.status, 201);
  const memberCookie = memberRegistration.headers.get('set-cookie').split(';')[0];
  assert.equal((await memberRegistration.json()).user.role, 'member');

  const memberDataResponse = await fetch(`${baseUrl}/api/family-data`, { headers: { Cookie: memberCookie } });
  const memberData = await memberDataResponse.json();
  memberData.tasks[0].completed = true;
  const memberSave = await fetch(`${baseUrl}/api/family-data`, { method: 'PUT', headers: { Cookie: memberCookie, 'Content-Type': 'application/json' }, body: JSON.stringify(memberData) });
  assert.equal(memberSave.status, 200);
  memberData.events[0].title = 'Nepovolená změna';
  const forbiddenSave = await fetch(`${baseUrl}/api/family-data`, { method: 'PUT', headers: { Cookie: memberCookie, 'Content-Type': 'application/json' }, body: JSON.stringify(memberData) });
  assert.equal(forbiddenSave.status, 403);

  const calendarResponse = await fetch(`${baseUrl}/calendar.ics?member=all&token=${registrationData.calendarToken}`);
  assert.equal(calendarResponse.status, 200);
  const calendar = await calendarResponse.text();
  assert.match(calendar, /BEGIN:VCALENDAR/);
  assert.match(calendar, /SUMMARY:Testovací aktivita/);

  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(logoutResponse.status, 200);
  assert.match(logoutResponse.headers.get('set-cookie'), /Max-Age=0/);
});

test('odmítne nesprávné heslo', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jan@example.test', password: 'spatneheslo' }) });
  assert.equal(response.status, 401);
});
