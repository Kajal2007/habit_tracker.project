"use strict";

/* ---------- Setup ---------- */
const STORAGE_KEY = "habitTracker.data";
const ICONS = { Health: "🥗", Study: "📚", Fitness: "🏋️", Personal: "🧘", Other: "⭐" };
const $ = (id) => document.getElementById(id);

/* ---------- Date helpers (dates are stored as "YYYY-MM-DD") ---------- */
const pad = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const todayKey = () => toKey(new Date());
const shiftKey = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
const monthStart = (k) => { const d = fromKey(k); return new Date(d.getFullYear(), d.getMonth(), 1); };
const longDate = (k) => fromKey(k).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Data + localStorage ---------- */
// Each habit: { id, name, category, createdAt, completions: ["2026-09-24", ...], currentStreak, longestStreak }
let habits = loadHabits();
const state = { category: "All", search: "", editingId: null, selected: todayKey(), month: monthStart(todayKey()) };

function loadHabits() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function saveHabits() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
  } catch (e) {
    console.warn("Could not save to localStorage", e);
  }
}

/* ---------- Streaks ---------- */
// Count back from today (or yesterday, if today isn't done yet) while days are consecutive.
function currentStreak(dates) {
  let day = dates.includes(todayKey()) ? todayKey() : shiftKey(todayKey(), -1);
  let count = 0;
  while (dates.includes(day)) {
    count++;
    day = shiftKey(day, -1);
  }
  return count;
}

// Walk through sorted dates and track the longest run of consecutive days.
function longestStreak(dates) {
  const sorted = [...new Set(dates)].sort();
  let best = 0, run = 0, prev = null;
  for (const d of sorted) {
    run = prev && shiftKey(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

function updateStreaks(h) {
  h.currentStreak = currentStreak(h.completions);
  h.longestStreak = longestStreak(h.completions);
}

// Overall streak: consecutive days with at least one habit completed.
function overallStreak() {
  return currentStreak(habits.flatMap((h) => h.completions));
}

/* ---------- Stats + messages ---------- */
function getStats() {
  const total = habits.length;
  const done = habits.filter((h) => h.completions.includes(todayKey())).length;
  return { total, done, left: total - done, pct: total ? Math.round((done / total) * 100) : 0 };
}

function getMessage(s) {
  if (!s.total) return "Add your first habit to get started.";
  if (s.pct === 100) return "Great job! 🎉 Every habit is done today.";
  if (s.pct >= 50) return `You're doing amazing! 🔥 ${s.done}/${s.total} habits completed today.`;
  return `Keep going! 💪 ${s.done}/${s.total} habits completed today.`;
}

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text; // avoids repeating the same live announcement
}

function announce(text) {
  $("status").textContent = "";
  setTimeout(() => { $("status").textContent = text; }, 50);
}

/* ---------- Rendering ---------- */
function render() {
  habits.forEach(updateStreaks);
  renderDashboard();
  renderList();
  renderHistory();
}

function renderDashboard() {
  const s = getStats();
  const hour = new Date().getHours();
  $("today-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  $("greeting").textContent = (hour < 12 ? "Good Morning!" : hour < 18 ? "Good Afternoon!" : "Good Evening!") + " 🌱";
  $("hero-summary").textContent = `${s.done} / ${s.total} habits completed · ${s.pct}% completed`;
  setText($("message"), getMessage(s));

  $("d-total").textContent = s.total;
  $("d-done").textContent = s.done;
  $("d-percent").textContent = s.pct + "%";
  $("d-streak").textContent = plural(overallStreak(), "day");

  $("p-total").textContent = s.total;
  $("p-done").textContent = s.done;
  $("p-left").textContent = s.left;
  $("p-percent").textContent = s.pct + "%";
  $("bar-fill").style.width = s.pct + "%";
  $("bar").setAttribute("aria-valuenow", s.pct);
}

function cardHtml(h) {
  if (h.id === state.editingId) return editHtml(h);
  const done = h.completions.includes(todayKey());
  const name = esc(h.name);
  return `
    <article class="card ${done ? "done" : ""}" data-id="${h.id}">
      <div>
        <h3><span aria-hidden="true">${ICONS[h.category]}</span> ${name}</h3>
        <p class="tag">${h.category}</p>
        <p class="status">${done ? "✓ Completed today" : "○ Not done today"}</p>
        <p class="streak">🔥 ${plural(h.currentStreak, "day")} streak (longest: ${h.longestStreak})</p>
      </div>
      <div class="actions">
        <button type="button" class="btn ${done ? "btn-done" : "btn-primary"}" data-action="toggle"
          aria-label="${done ? "Undo completion for" : "Mark complete:"} ${name}">${done ? "↩ Undo" : "Mark Complete"}</button>
        <button type="button" class="btn btn-ghost" data-action="edit" aria-label="Edit ${name}">Edit</button>
        <button type="button" class="btn btn-danger" data-action="delete" aria-label="Delete ${name}">Delete</button>
      </div>
    </article>`;
}

function editHtml(h) {
  const options = Object.keys(ICONS).map((c) => `<option ${c === h.category ? "selected" : ""}>${c}</option>`).join("");
  return `
    <article class="card editing" data-id="${h.id}">
      <form class="edit-form" novalidate>
        <label for="en-${h.id}">Habit name</label>
        <input id="en-${h.id}" name="editName" maxlength="60" value="${esc(h.name)}" autocomplete="off">
        <label for="ec-${h.id}">Category</label>
        <select id="ec-${h.id}" name="editCategory">${options}</select>
        <p class="error" aria-live="polite"></p>
        <div class="actions">
          <button type="submit" class="btn btn-primary">Save changes</button>
          <button type="button" class="btn btn-ghost" data-action="cancel">Cancel</button>
        </div>
      </form>
    </article>`;
}

function renderList() {
  const hasHabits = habits.length > 0;
  $("empty-state").hidden = hasHabits;
  $("habit-tools").hidden = !hasHabits;

  const query = state.search.trim().toLowerCase();
  const shown = habits.filter((h) =>
    (state.category === "All" || h.category === state.category) && h.name.toLowerCase().includes(query)
  );
  $("no-match").hidden = !hasHabits || shown.length > 0;
  $("habit-list").innerHTML = shown.map(cardHtml).join("");
}

function focusInCard(id, selector) {
  const el = document.querySelector(`[data-id="${id}"] ${selector}`);
  if (el) el.focus();
}

/* ---------- History / calendar ---------- */
function dayInfo(key) {
  const list = habits.filter((h) => h.createdAt <= key);
  if (!list.length || key > todayKey()) return { cls: "nodata", icon: "–", text: "No data", list: [], done: 0 };
  const done = list.filter((h) => h.completions.includes(key)).length;
  return done === list.length
    ? { cls: "complete", icon: "✓", text: "Completed", list, done }
    : { cls: "missed", icon: "✗", text: "Not completed", list, done };
}

function renderHistory() {
  const y = state.month.getFullYear(), m = state.month.getMonth();
  $("month-title").textContent = state.month.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  let html = "<span></span>".repeat(new Date(y, m, 1).getDay());
  for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) {
    const key = `${y}-${pad(m + 1)}-${pad(d)}`;
    const info = dayInfo(key);
    html += `<button type="button" class="day ${info.cls} ${key === state.selected ? "selected" : ""}" data-date="${key}"
      aria-pressed="${key === state.selected}" aria-label="${longDate(key)}: ${info.text}">
      <span>${d}</span><small aria-hidden="true">${info.icon}</small></button>`;
  }
  $("calendar").innerHTML = html;

  $("history-date").value = state.selected;
  $("history-date").max = todayKey();

  const info = dayInfo(state.selected);
  let detail = `<h3>${longDate(state.selected)}</h3>`;
  if (!info.list.length) {
    detail += "<p>No data for this day.</p>";
  } else {
    detail += `<p><strong>${info.text}</strong>: ${info.done} of ${info.list.length} habits done.</p><ul>` +
      info.list.map((h) => `<li>${ICONS[h.category]} ${esc(h.name)}: ${h.completions.includes(state.selected) ? "✓ Completed" : "✗ Not completed"}</li>`).join("") + "</ul>";
  }
  $("day-detail").innerHTML = detail;
}

/* ---------- Actions ---------- */
function addHabit(name, category) {
  habits.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, category, createdAt: todayKey(), completions: [], currentStreak: 0, longestStreak: 0 });
  saveHabits();
  setCategory("All");
  state.search = "";
  $("search").value = "";
  render();
  announce(`Added habit: ${name}.`);
}

function toggleHabit(id) {
  const h = habits.find((x) => x.id === id);
  const i = h.completions.indexOf(todayKey());
  if (i >= 0) h.completions.splice(i, 1); else h.completions.push(todayKey());
  saveHabits();
  render();
  focusInCard(id, '[data-action="toggle"]');
  announce(`${h.name} marked ${i >= 0 ? "not completed" : "completed"} today. ${getStats().done} of ${habits.length} habits done.`);
}

function deleteHabit(id) {
  const h = habits.find((x) => x.id === id);
  if (!confirm(`Delete "${h.name}"? This will permanently remove it and its history.`)) return;
  habits = habits.filter((x) => x.id !== id);
  saveHabits();
  render();
  announce(`Deleted habit: ${h.name}.`);
}

function setCategory(cat) {
  state.category = cat;
  document.querySelectorAll(".chip").forEach((chip) => {
    const active = chip.dataset.cat === cat;
    chip.classList.toggle("active", active);
    chip.setAttribute("aria-pressed", active);
  });
}

/* ---------- Event listeners ---------- */
$("habit-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("habit-name");
  const name = input.value.trim();
  if (!name) {
    $("form-error").textContent = "Please enter a habit name.";
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }
  $("form-error").textContent = "";
  input.removeAttribute("aria-invalid");
  addHabit(name, $("habit-category").value);
  input.value = "";
  input.focus();
});

$("empty-add").addEventListener("click", () => $("habit-name").focus());

$("search").addEventListener("input", (e) => { state.search = e.target.value; renderList(); });

document.querySelector(".filters").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  setCategory(chip.dataset.cat);
  renderList();
});

$("habit-list").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.closest("[data-id]").dataset.id;
  const action = btn.dataset.action;
  if (action === "toggle") toggleHabit(id);
  if (action === "delete") deleteHabit(id);
  if (action === "edit") { state.editingId = id; renderList(); focusInCard(id, "input"); }
  if (action === "cancel") { state.editingId = null; renderList(); focusInCard(id, '[data-action="edit"]'); }
});

$("habit-list").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.closest("[data-id]").dataset.id;
  const name = form.elements.editName.value.trim();
  if (!name) {
    form.querySelector(".error").textContent = "Please enter a habit name.";
    form.elements.editName.focus();
    return;
  }
  const h = habits.find((x) => x.id === id);
  h.name = name;
  h.category = form.elements.editCategory.value;
  state.editingId = null;
  saveHabits();
  render();
  focusInCard(id, '[data-action="edit"]');
  announce(`Updated habit: ${name}.`);
});

$("calendar").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-date]");
  if (!btn) return;
  state.selected = btn.dataset.date;
  renderHistory();
  document.querySelector(`[data-date="${state.selected}"]`).focus();
});

$("history-date").addEventListener("change", (e) => {
  if (!e.target.value || e.target.value > todayKey()) return;
  state.selected = e.target.value;
  state.month = monthStart(state.selected);
  renderHistory();
});

$("prev-month").addEventListener("click", () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderHistory(); });
$("next-month").addEventListener("click", () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderHistory(); });

$("clear-data").addEventListener("click", () => {
  if (!confirm("Clear all habits and history? This cannot be undone.")) return;
  habits = [];
  localStorage.removeItem(STORAGE_KEY);
  state.editingId = null;
  state.selected = todayKey();
  state.month = monthStart(todayKey());
  setCategory("All");
  state.search = "";
  $("search").value = "";
  render();
  announce("All data cleared.");
});

/* ---------- Start ---------- */
render();
saveHabits(); // saves refreshed streak values