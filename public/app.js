const MEMBER_DETAILS = {
  jan: { name: 'Jan', initial: 'J', role: 'Správce rodiny' },
  petra: { name: 'Petra', initial: 'P', role: 'Rodič' },
  eliska: { name: 'Eliška', initial: 'E', role: 'Dítě' },
  tomas: { name: 'Tomáš', initial: 'T', role: 'Dítě' }
};
const DEFAULT_EVENTS = [
  { id: 1, title: 'Ranní porada', member: 'jan', date: '2026-08-26', time: '07:30', location: 'Online' },
  { id: 2, title: 'Zubař', member: 'petra', date: '2026-08-26', time: '10:00', location: 'Poliklinika Vinohrady' },
  { id: 3, title: 'Vyzvednout Elišku', member: 'jan', date: '2026-08-26', time: '15:30', location: 'Základní škola' },
  { id: 4, title: 'Klavír', member: 'eliska', date: '2026-08-26', time: '16:30', location: 'ZUŠ' },
  { id: 5, title: 'Fotbalový trénink', member: 'tomas', date: '2026-08-26', time: '17:00', location: 'SK Meteor' },
  { id: 6, title: 'Rodinný oběd', member: 'petra', date: '2026-08-30', time: '12:00', location: 'U babičky' },
  { id: 7, title: 'Třídní schůzky', member: 'jan', date: '2026-09-03', time: '17:30', location: 'Základní škola' }
];
const DEFAULT_TASKS = [
  { id: 1, title: 'Objednat Tomáše k lékaři', dueDate: '2026-08-26', member: 'petra', completed: true },
  { id: 2, title: 'Vynést tříděný odpad', dueDate: '2026-08-26', member: 'tomas', completed: false },
  { id: 3, title: 'Koupit věci na snídani', dueDate: '2026-08-26', member: 'jan', completed: false },
  { id: 4, title: 'Potvrdit školní výlet', dueDate: '2026-08-26', member: 'petra', completed: true },
  { id: 5, title: 'Zalít bylinky', dueDate: '2026-08-26', member: 'eliska', completed: false }
];
const DAY_NAMES = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const MONTH_NAMES = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const MONTH_DATE_NAMES = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
const STORAGE_KEY = 'familyTimesData';
const TODAY_DATE = new Date(2026, 7, 26);
let selectedDate = new Date(TODAY_DATE);
let displayedMonth = new Date(2026, 7, 1);
let selectedMember = 'all';
let selectedTaskFilter = 'open';
let familyData = loadFamilyData();

function loadFamilyData() {
  try {
    const storedData = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!storedData) return { events: DEFAULT_EVENTS, tasks: DEFAULT_TASKS };
    storedData.events = (storedData.events || []).map((event) => ({ ...event, date: event.date || '2026-08-26' }));
    storedData.tasks = (storedData.tasks || []).map((task) => ({ ...task, dueDate: task.dueDate || '2026-08-26' }));
    return storedData;
  } catch { return { events: DEFAULT_EVENTS, tasks: DEFAULT_TASKS }; }
}
function saveFamilyData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(familyData)); }
function formatDateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function formatDueDate(dateKey) { if (dateKey === formatDateKey(TODAY_DATE)) return 'Dnes'; const date = new Date(`${dateKey}T12:00:00`); return `${date.getDate()}. ${MONTH_DATE_NAMES[date.getMonth()]}`; }
function getWeekStart(date) { const weekStart = new Date(date); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); return weekStart; }
function escapeHtml(value = '') { const element = document.createElement('span'); element.textContent = value; return element.innerHTML; }

function renderWeekStrip() {
  const weekStart = getWeekStart(selectedDate);
  document.querySelector('#week-strip').innerHTML = DAY_NAMES.map((dayName, dayIndex) => {
    const date = new Date(weekStart); date.setDate(weekStart.getDate() + dayIndex);
    return `<button class="week-day ${formatDateKey(date) === formatDateKey(selectedDate) ? 'week-day--active' : ''}" type="button" data-date="${formatDateKey(date)}"><span>${dayName}</span><strong>${date.getDate()}</strong></button>`;
  }).join('');
}
function renderTimeline() {
  const events = familyData.events.filter((event) => event.date === formatDateKey(selectedDate)).filter((event) => selectedMember === 'all' || event.member === selectedMember).sort((a, b) => a.time.localeCompare(b.time));
  const timeline = document.querySelector('#timeline');
  if (!events.length) { timeline.innerHTML = '<div class="empty-schedule">Pro tento den a výběr nejsou naplánované žádné aktivity.</div>'; return; }
  timeline.innerHTML = events.map((event) => { const member = MEMBER_DETAILS[event.member]; return `<div class="timeline-row"><time class="timeline-row__time">${event.time}</time><div class="timeline-row__content"><article class="event-card event-card--${event.member}" data-event-id="${event.id}" tabindex="0" role="button"><span class="avatar avatar--${event.member}">${member.initial}</span><div class="event-card__details"><strong>${escapeHtml(event.title)}</strong><small>${member.name} · ${escapeHtml(event.location || 'Bez místa')}</small></div><span class="event-card__time">${event.time}</span></article></div></div>`; }).join('');
}
function createTaskMarkup(task, isFullView) {
  const member = MEMBER_DETAILS[task.member];
  if (!isFullView) return `<label class="task-item"><input type="checkbox" data-task-id="${task.id}" ${task.completed ? 'checked' : ''}><span class="task-item__check"><svg><use href="#icon-check"></use></svg></span><span class="task-item__content"><strong>${escapeHtml(task.title)}</strong><small>${member.name} · ${formatDueDate(task.dueDate)}</small></span><span class="avatar avatar--${task.member}">${member.initial}</span></label>`;
  return `<label class="full-task"><input type="checkbox" data-task-id="${task.id}" ${task.completed ? 'checked' : ''}><span class="task-item__check"><svg><use href="#icon-check"></use></svg></span><span class="task-item__content"><strong>${escapeHtml(task.title)}</strong><small>${member.name}</small></span><time class="full-task__due">${formatDueDate(task.dueDate)}</time><button class="delete-button" type="button" data-delete-task="${task.id}" aria-label="Smazat úkol">×</button></label>`;
}
function renderDashboardTasks() { document.querySelector('#task-list').innerHTML = familyData.tasks.slice(0, 5).map((task) => createTaskMarkup(task, false)).join(''); updateTaskSummary(); }
function renderFullTaskList() {
  const tasks = familyData.tasks.filter((task) => selectedTaskFilter === 'all' || (selectedTaskFilter === 'open' ? !task.completed : task.completed));
  document.querySelector('#full-task-list').innerHTML = tasks.length ? tasks.map((task) => createTaskMarkup(task, true)).join('') : '<div class="empty-state"><strong>Všechno je hotové</strong>V tomto seznamu teď nejsou žádné úkoly.</div>';
}
function updateTaskSummary() {
  const completedCount = familyData.tasks.filter((task) => task.completed).length;
  const progress = familyData.tasks.length ? Math.round(completedCount / familyData.tasks.length * 100) : 0;
  document.querySelector('#completed-count').textContent = completedCount; document.querySelector('#task-count').textContent = familyData.tasks.length - completedCount;
  document.querySelector('#progress-ring').style.background = `conic-gradient(var(--primary-color) ${progress}%, #e8e7e1 0)`; document.querySelector('#progress-ring span').textContent = `${progress}%`;
}
function renderMonthCalendar() {
  const year = displayedMonth.getFullYear(); const month = displayedMonth.getMonth(); const firstDate = new Date(year, month, 1); firstDate.setDate(firstDate.getDate() - ((firstDate.getDay() + 6) % 7));
  document.querySelector('#month-title').textContent = `${MONTH_NAMES[month][0].toUpperCase()}${MONTH_NAMES[month].slice(1)} ${year}`;
  const days = [];
  for (let index = 0; index < 42; index += 1) { const date = new Date(firstDate); date.setDate(firstDate.getDate() + index); const key = formatDateKey(date); const classes = ['month-day']; if (date.getMonth() !== month) classes.push('month-day--muted'); if (key === formatDateKey(TODAY_DATE)) classes.push('month-day--today'); const events = familyData.events.filter((event) => event.date === key); days.push(`<button class="${classes.join(' ')}" type="button" data-calendar-date="${key}"><span class="month-day__number">${date.getDate()}</span>${events.slice(0, 3).map((event) => `<span class="calendar-event calendar-event--${event.member}" data-event-id="${event.id}">${event.time} ${escapeHtml(event.title)}</span>`).join('')}</button>`); }
  document.querySelector('#month-grid').innerHTML = days.join('');
}
function renderFamilyMembers() {
  document.querySelector('#family-grid').innerHTML = Object.entries(MEMBER_DETAILS).map(([key, member]) => { const events = familyData.events.filter((event) => event.member === key).length; const tasks = familyData.tasks.filter((task) => task.member === key && !task.completed).length; const surname = key === 'petra' || key === 'eliska' ? 'Svobodová' : 'Svoboda'; return `<article class="family-member-card"><span class="avatar avatar--${key}">${member.initial}</span><strong>${member.name} ${surname}</strong><small>${member.role}</small><div class="family-member-card__stats"><span><b>${events}</b> aktivit</span><span><b>${tasks}</b> úkolů</span></div></article>`; }).join('');
}
function updateDashboardSummary() { const events = familyData.events.filter((event) => event.date === formatDateKey(TODAY_DATE)).sort((a, b) => a.time.localeCompare(b.time)); const card = document.querySelector('.summary-card--hero'); card.querySelector('strong').textContent = `${events.length} aktivit`; card.querySelector('small').textContent = events.length ? `První v ${events[0].time}` : 'Volný den'; }
function renderApplication() { renderWeekStrip(); renderTimeline(); renderDashboardTasks(); renderFullTaskList(); renderMonthCalendar(); renderFamilyMembers(); updateDashboardSummary(); }
function showToast(message) { const toast = document.querySelector('#toast'); toast.textContent = message; toast.classList.add('toast--visible'); clearTimeout(showToast.timeoutId); showToast.timeoutId = setTimeout(() => toast.classList.remove('toast--visible'), 2400); }
function openActivityDialog(title = '', date = formatDateKey(selectedDate)) { const dialog = document.querySelector('#activity-dialog'); document.querySelector('#activity-form').reset(); dialog.querySelector('[name="eventId"]').value = ''; dialog.querySelector('[name="title"]').value = title; dialog.querySelector('[name="time"]').value = '16:00'; dialog.querySelector('[name="date"]').value = date; document.querySelector('#activity-dialog-label').textContent = 'NOVÁ POLOŽKA'; document.querySelector('#activity-dialog-title').textContent = 'Přidat aktivitu'; document.querySelector('#repeat-field').hidden = false; document.querySelector('#delete-event-button').classList.add('danger-button--hidden'); dialog.showModal(); dialog.querySelector('[name="title"]').focus(); }
function openEventDetails(eventId) { const selectedEvent = familyData.events.find((event) => event.id === eventId); if (!selectedEvent) return; const dialog = document.querySelector('#activity-dialog'); document.querySelector('#activity-form').reset(); Object.entries(selectedEvent).forEach(([key, value]) => { const field = dialog.querySelector(`[name="${key === 'id' ? 'eventId' : key}"]`); if (field) field.value = value; }); document.querySelector('#activity-dialog-label').textContent = 'DETAIL AKTIVITY'; document.querySelector('#activity-dialog-title').textContent = 'Upravit aktivitu'; document.querySelector('#repeat-field').hidden = true; document.querySelector('#delete-event-button').classList.remove('danger-button--hidden'); dialog.showModal(); }
function openTaskDialog() { const dialog = document.querySelector('#task-dialog'); document.querySelector('#task-form').reset(); dialog.querySelector('[name="dueDate"]').value = formatDateKey(TODAY_DATE); dialog.showModal(); dialog.querySelector('[name="title"]').focus(); }
function changeView(viewName) { const titles = { today: 'Dobré ráno, Jane 👋', calendar: 'Rodinný kalendář', tasks: 'Úkoly a povinnosti', family: 'Naše rodina' }; document.querySelectorAll('.app-view').forEach((view) => view.classList.toggle('app-view--hidden', view.dataset.page !== viewName)); document.querySelectorAll('[data-view]').forEach((item) => { item.classList.toggle('main-nav__item--active', item.dataset.view === viewName && item.classList.contains('main-nav__item')); item.classList.toggle('mobile-nav__item--active', item.dataset.view === viewName && item.classList.contains('mobile-nav__item')); }); document.querySelector('#page-title').textContent = titles[viewName]; document.querySelector('#add-event-button span').textContent = viewName === 'tasks' ? 'Přidat úkol' : 'Přidat aktivitu'; }
function toggleTask(taskId, completed) { const task = familyData.tasks.find((item) => item.id === taskId); if (!task) return; task.completed = completed; saveFamilyData(); renderDashboardTasks(); renderFullTaskList(); renderFamilyMembers(); showToast(completed ? 'Úkol je splněný. Skvělá práce!' : 'Úkol byl znovu otevřen.'); }

document.addEventListener('change', (event) => { if (event.target.matches('[data-task-id]')) toggleTask(Number(event.target.dataset.taskId), event.target.checked); });
document.querySelector('#member-filters').addEventListener('click', (event) => { const button = event.target.closest('[data-member]'); if (!button) return; selectedMember = button.dataset.member; document.querySelectorAll('.member-chip').forEach((item) => item.classList.toggle('member-chip--active', item === button)); renderTimeline(); });
document.querySelector('#week-strip').addEventListener('click', (event) => { const button = event.target.closest('[data-date]'); if (!button) return; selectedDate = new Date(`${button.dataset.date}T12:00:00`); renderWeekStrip(); renderTimeline(); });
document.querySelector('#month-grid').addEventListener('click', (event) => { const eventItem = event.target.closest('[data-event-id]'); if (eventItem) { openEventDetails(Number(eventItem.dataset.eventId)); return; } const button = event.target.closest('[data-calendar-date]'); if (button) openActivityDialog('', button.dataset.calendarDate); });
document.querySelector('#timeline').addEventListener('click', (event) => { const eventItem = event.target.closest('[data-event-id]'); if (eventItem) openEventDetails(Number(eventItem.dataset.eventId)); });
document.querySelector('#timeline').addEventListener('keydown', (event) => { const eventItem = event.target.closest('[data-event-id]'); if (eventItem && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openEventDetails(Number(eventItem.dataset.eventId)); } });
document.querySelector('#task-filters').addEventListener('click', (event) => { const button = event.target.closest('[data-task-filter]'); if (!button) return; selectedTaskFilter = button.dataset.taskFilter; document.querySelectorAll('.task-filter').forEach((item) => item.classList.toggle('task-filter--active', item === button)); renderFullTaskList(); });
document.querySelector('#full-task-list').addEventListener('click', (event) => { const button = event.target.closest('[data-delete-task]'); if (!button) return; event.preventDefault(); familyData.tasks = familyData.tasks.filter((task) => task.id !== Number(button.dataset.deleteTask)); saveFamilyData(); renderDashboardTasks(); renderFullTaskList(); renderFamilyMembers(); showToast('Úkol byl odstraněn.'); });
document.querySelector('#activity-form').addEventListener('submit', (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const eventId = Number(data.get('eventId')); const eventData = { title: data.get('title').trim(), member: data.get('member'), date: data.get('date'), time: data.get('time'), location: data.get('location').trim() }; if (eventId) { const eventIndex = familyData.events.findIndex((item) => item.id === eventId); if (eventIndex >= 0) familyData.events[eventIndex] = { ...familyData.events[eventIndex], ...eventData }; } else { const repeatCount = { none: 1, 'weekly-4': 4, 'weekly-8': 8 }[data.get('repeat')] || 1; const firstDate = new Date(`${eventData.date}T12:00:00`); for (let index = 0; index < repeatCount; index += 1) { const occurrenceDate = new Date(firstDate); occurrenceDate.setDate(firstDate.getDate() + index * 7); familyData.events.push({ id: Date.now() + index, ...eventData, date: formatDateKey(occurrenceDate) }); } } saveFamilyData(); renderApplication(); document.querySelector('#activity-dialog').close(); showToast(eventId ? 'Změny aktivity byly uloženy.' : 'Aktivita byla přidána do rodinného plánu.'); });
document.querySelector('#task-form').addEventListener('submit', (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); familyData.tasks.push({ id: Date.now(), title: data.get('title').trim(), member: data.get('member'), dueDate: data.get('dueDate'), completed: false }); saveFamilyData(); renderDashboardTasks(); renderFullTaskList(); renderFamilyMembers(); document.querySelector('#task-dialog').close(); showToast('Nový úkol byl přidán.'); });
document.querySelectorAll('[data-view]').forEach((link) => link.addEventListener('click', () => changeView(link.dataset.view)));
window.addEventListener('hashchange', () => { const view = location.hash.slice(1); if (['today', 'calendar', 'tasks', 'family'].includes(view)) changeView(view); });
document.querySelector('#add-event-button').addEventListener('click', () => location.hash === '#tasks' ? openTaskDialog() : openActivityDialog()); document.querySelector('#mobile-add-button').addEventListener('click', () => openActivityDialog()); document.querySelector('#plan-evening-button').addEventListener('click', () => openActivityDialog('Rodinný večer', '2026-08-28'));
document.querySelector('#add-task-button').addEventListener('click', openTaskDialog); document.querySelector('#full-add-task-button').addEventListener('click', openTaskDialog);
document.querySelector('#close-dialog').addEventListener('click', () => document.querySelector('#activity-dialog').close()); document.querySelector('#cancel-dialog').addEventListener('click', () => document.querySelector('#activity-dialog').close()); document.querySelector('#close-task-dialog').addEventListener('click', () => document.querySelector('#task-dialog').close()); document.querySelector('#cancel-task-dialog').addEventListener('click', () => document.querySelector('#task-dialog').close());
document.querySelector('#delete-event-button').addEventListener('click', () => { const eventId = Number(document.querySelector('#activity-form [name="eventId"]').value); if (!eventId) return; familyData.events = familyData.events.filter((event) => event.id !== eventId); saveFamilyData(); renderApplication(); document.querySelector('#activity-dialog').close(); showToast('Aktivita byla odstraněna.'); });
document.querySelector('#previous-week').addEventListener('click', () => { selectedDate.setDate(selectedDate.getDate() - 7); renderWeekStrip(); renderTimeline(); }); document.querySelector('#next-week').addEventListener('click', () => { selectedDate.setDate(selectedDate.getDate() + 7); renderWeekStrip(); renderTimeline(); }); document.querySelector('#current-week').addEventListener('click', () => { selectedDate = new Date(TODAY_DATE); renderWeekStrip(); renderTimeline(); });
document.querySelector('#previous-month').addEventListener('click', () => { displayedMonth.setMonth(displayedMonth.getMonth() - 1); renderMonthCalendar(); }); document.querySelector('#next-month').addEventListener('click', () => { displayedMonth.setMonth(displayedMonth.getMonth() + 1); renderMonthCalendar(); }); document.querySelector('#current-month').addEventListener('click', () => { displayedMonth = new Date(2026, 7, 1); renderMonthCalendar(); });
document.querySelector('#show-all-tasks').addEventListener('click', () => { location.hash = 'tasks'; changeView('tasks'); }); document.querySelector('#print-button').addEventListener('click', () => print()); document.querySelector('#notification-button').addEventListener('click', () => showToast('Nemáte žádná nová upozornění.')); document.querySelector('#settings-button').addEventListener('click', () => showToast('Nastavení synchronizace připravujeme.')); document.querySelector('#invite-member-button').addEventListener('click', () => showToast('Pozvánka bude dostupná po připojení účtů.'));

function initializeApplication() { document.querySelector('#today-label').textContent = `${DAY_NAMES[(TODAY_DATE.getDay() + 6) % 7]}, ${TODAY_DATE.getDate()}. ${MONTH_DATE_NAMES[TODAY_DATE.getMonth()]}`.toUpperCase(); renderApplication(); const view = ['today', 'calendar', 'tasks', 'family'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today'; changeView(view); }
initializeApplication();
