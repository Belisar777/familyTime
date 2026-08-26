const MEMBER_DETAILS = {
  jan: { name: 'Jan', initial: 'J' },
  petra: { name: 'Petra', initial: 'P' },
  eliska: { name: 'Eliška', initial: 'E' },
  tomas: { name: 'Tomáš', initial: 'T' }
};

const DEFAULT_EVENTS = [
  { id: 1, title: 'Ranní porada', member: 'jan', time: '07:30', location: 'Online' },
  { id: 2, title: 'Zubař', member: 'petra', time: '10:00', location: 'Poliklinika Vinohrady' },
  { id: 3, title: 'Vyzvednout Elišku', member: 'jan', time: '15:30', location: 'Základní škola' },
  { id: 4, title: 'Klavír', member: 'eliska', time: '16:30', location: 'ZUŠ' },
  { id: 5, title: 'Fotbalový trénink', member: 'tomas', time: '17:00', location: 'SK Meteor' }
];

const DEFAULT_TASKS = [
  { id: 1, title: 'Objednat Tomáše k lékaři', detail: 'Petra · Dnes', member: 'petra', completed: true },
  { id: 2, title: 'Vynést tříděný odpad', detail: 'Tomáš · Do 18:00', member: 'tomas', completed: false },
  { id: 3, title: 'Koupit věci na snídani', detail: 'Jan · Cestou domů', member: 'jan', completed: false },
  { id: 4, title: 'Potvrdit školní výlet', detail: 'Petra · Dnes', member: 'petra', completed: true },
  { id: 5, title: 'Zalít bylinky', detail: 'Eliška · Večer', member: 'eliska', completed: false }
];

const DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const MONTHS = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
const STORAGE_KEY = 'familyTimesData';

let selectedDate = new Date(2026, 7, 26);
let selectedMember = 'all';
let familyData = loadFamilyData();

function loadFamilyData() {
  try {
    const storedData = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return storedData || { events: DEFAULT_EVENTS, tasks: DEFAULT_TASKS };
  } catch {
    return { events: DEFAULT_EVENTS, tasks: DEFAULT_TASKS };
  }
}

function saveFamilyData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(familyData));
}

function getWeekStart(date) {
  const weekStart = new Date(date);
  const dayOffset = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - dayOffset);
  return weekStart;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderWeekStrip() {
  const weekStrip = document.querySelector('#week-strip');
  const weekStart = getWeekStart(selectedDate);
  weekStrip.innerHTML = DAYS.map((dayName, dayIndex) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + dayIndex);
    const isActive = formatDateKey(date) === formatDateKey(selectedDate);
    return `<button class="week-day ${isActive ? 'week-day--active' : ''}" type="button" data-date="${formatDateKey(date)}"><span>${dayName}</span><strong>${date.getDate()}</strong></button>`;
  }).join('');
}

function renderTimeline() {
  const timeline = document.querySelector('#timeline');
  const filteredEvents = familyData.events
    .filter((event) => selectedMember === 'all' || event.member === selectedMember)
    .sort((firstEvent, secondEvent) => firstEvent.time.localeCompare(secondEvent.time));

  if (!filteredEvents.length) {
    timeline.innerHTML = '<div class="empty-schedule">Pro tento výběr nejsou naplánované žádné aktivity.</div>';
    return;
  }

  timeline.innerHTML = filteredEvents.map((event) => {
    const member = MEMBER_DETAILS[event.member];
    return `<div class="timeline-row"><time class="timeline-row__time">${event.time}</time><div class="timeline-row__content"><article class="event-card event-card--${event.member}"><span class="avatar avatar--${event.member}">${member.initial}</span><div class="event-card__details"><strong>${escapeHtml(event.title)}</strong><small>${member.name} · ${escapeHtml(event.location || 'Bez místa')}</small></div><span class="event-card__time">${event.time}</span></article></div></div>`;
  }).join('');
}

function renderTasks() {
  const taskList = document.querySelector('#task-list');
  taskList.innerHTML = familyData.tasks.map((task) => `<label class="task-item"><input type="checkbox" data-task-id="${task.id}" ${task.completed ? 'checked' : ''}><span class="task-item__check"><svg aria-hidden="true"><use href="#icon-check"></use></svg></span><span class="task-item__content"><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.detail)}</small></span><span class="avatar avatar--${task.member}">${MEMBER_DETAILS[task.member].initial}</span></label>`).join('');
  updateTaskSummary();
}

function updateTaskSummary() {
  const completedCount = familyData.tasks.filter((task) => task.completed).length;
  const openCount = familyData.tasks.length - completedCount;
  const progress = familyData.tasks.length ? Math.round((completedCount / familyData.tasks.length) * 100) : 0;
  document.querySelector('#completed-count').textContent = completedCount;
  document.querySelector('#task-count').textContent = openCount;
  document.querySelector('#progress-ring').style.background = `conic-gradient(var(--primary-color) ${progress}%, #e8e7e1 0)`;
  document.querySelector('#progress-ring span').textContent = `${progress}%`;
}

function escapeHtml(value) {
  const textElement = document.createElement('span');
  textElement.textContent = value;
  return textElement.innerHTML;
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('toast--visible');
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => toast.classList.remove('toast--visible'), 2400);
}

function openActivityDialog(presetTitle = '') {
  const dialog = document.querySelector('#activity-dialog');
  const titleInput = dialog.querySelector('[name="title"]');
  document.querySelector('#activity-form').reset();
  dialog.querySelector('[name="time"]').value = '16:00';
  titleInput.value = presetTitle;
  dialog.showModal();
  titleInput.focus();
}

function shiftSelectedWeek(dayCount) {
  selectedDate.setDate(selectedDate.getDate() + dayCount);
  renderWeekStrip();
}

document.querySelector('#member-filters').addEventListener('click', (event) => {
  const memberButton = event.target.closest('[data-member]');
  if (!memberButton) return;
  selectedMember = memberButton.dataset.member;
  document.querySelectorAll('.member-chip').forEach((button) => button.classList.toggle('member-chip--active', button === memberButton));
  renderTimeline();
});

document.querySelector('#week-strip').addEventListener('click', (event) => {
  const dayButton = event.target.closest('[data-date]');
  if (!dayButton) return;
  selectedDate = new Date(`${dayButton.dataset.date}T12:00:00`);
  renderWeekStrip();
});

document.querySelector('#task-list').addEventListener('change', (event) => {
  const taskId = Number(event.target.dataset.taskId);
  const selectedTask = familyData.tasks.find((task) => task.id === taskId);
  if (!selectedTask) return;
  selectedTask.completed = event.target.checked;
  saveFamilyData();
  updateTaskSummary();
  showToast(event.target.checked ? 'Úkol je splněný. Skvělá práce!' : 'Úkol byl znovu otevřen.');
});

document.querySelector('#activity-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  familyData.events.push({
    id: Date.now(),
    title: formData.get('title').trim(),
    member: formData.get('member'),
    time: formData.get('time'),
    location: formData.get('location').trim()
  });
  saveFamilyData();
  renderTimeline();
  document.querySelector('#activity-dialog').close();
  showToast('Aktivita byla přidána do rodinného plánu.');
});

document.querySelector('#add-event-button').addEventListener('click', () => openActivityDialog());
document.querySelector('#mobile-add-button').addEventListener('click', () => openActivityDialog());
document.querySelector('#plan-evening-button').addEventListener('click', () => openActivityDialog('Rodinný večer'));
document.querySelector('#close-dialog').addEventListener('click', () => document.querySelector('#activity-dialog').close());
document.querySelector('#cancel-dialog').addEventListener('click', () => document.querySelector('#activity-dialog').close());
document.querySelector('#previous-week').addEventListener('click', () => shiftSelectedWeek(-7));
document.querySelector('#next-week').addEventListener('click', () => shiftSelectedWeek(7));
document.querySelector('#current-week').addEventListener('click', () => { selectedDate = new Date(2026, 7, 26); renderWeekStrip(); });
document.querySelector('#print-button').addEventListener('click', () => window.print());
document.querySelector('#notification-button').addEventListener('click', () => showToast('Nemáte žádná nová upozornění.'));
document.querySelector('#settings-button').addEventListener('click', () => showToast('Nastavení připravujeme pro další verzi.'));
document.querySelector('#show-all-tasks').addEventListener('click', () => document.querySelector('#task-list').scrollIntoView({ behavior: 'smooth' }));
document.querySelector('#add-task-button').addEventListener('click', () => showToast('Rychlé přidání úkolu bude v další verzi.'));

document.querySelectorAll('[data-view]').forEach((link) => link.addEventListener('click', () => {
  const selectedView = link.dataset.view;
  document.querySelectorAll('[data-view]').forEach((item) => {
    item.classList.toggle('main-nav__item--active', item.dataset.view === selectedView && item.classList.contains('main-nav__item'));
    item.classList.toggle('mobile-nav__item--active', item.dataset.view === selectedView && item.classList.contains('mobile-nav__item'));
  });
  if (selectedView !== 'today') showToast('Tato sekce bude rozšířena v další etapě.');
}));

function initializeApplication() {
  const currentDate = new Date(2026, 7, 26);
  document.querySelector('#today-label').textContent = `${DAYS[(currentDate.getDay() + 6) % 7]}, ${currentDate.getDate()}. ${MONTHS[currentDate.getMonth()]}`.toUpperCase();
  renderWeekStrip();
  renderTimeline();
  renderTasks();
}

initializeApplication();
