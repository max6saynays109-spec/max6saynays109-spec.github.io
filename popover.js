import { OBR, loadSettings, saveSettings, numberItems, clearNumbers, clearAllNumbers } from "./shared.js";
import { isToken } from "./logic.js";

const $ = (id) => document.getElementById(id);

let state = null; // текущие настройки
let selection = []; // id выделенных предметов
let eligible = []; // id выделенных токенов (в порядке выделения)
let selToken = 0;

function applyTheme(theme) {
  try {
    const s = document.documentElement.style;
    s.setProperty("--fg", theme.text.primary);
    s.setProperty("--muted", theme.text.secondary);
    s.setProperty("--accent", theme.primary.main);
    s.setProperty("--accent-fg", theme.primary.contrastText || "#000");
    s.setProperty("--border", theme.mode === "DARK" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)");
  } catch (_) {
    /* оставляем цвета по умолчанию */
  }
}

let msgTimer;
function say(text) {
  $("msg").textContent = text;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => ($("msg").textContent = ""), 4000);
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

async function refreshSelection() {
  const my = ++selToken;
  let ids = [];
  if (selection.length) {
    const items = await OBR.scene.items.getItems(selection);
    const ok = new Set(items.filter(isToken).map((i) => i.id));
    ids = selection.filter((id) => ok.has(id));
  }
  if (my !== selToken) return;
  eligible = ids;
  const n = ids.length;
  $("selInfo").textContent = n
    ? `Выбрано ${n} ${plural(n, "токен", "токена", "токенов")}`
    : "Выделите токены на карте";
  for (const id of ["btnNumber", "btnRenumber", "btnClear"]) $(id).disabled = n === 0;
}

async function run(fn, done) {
  try {
    const n = await fn();
    say(done(n));
  } catch (err) {
    console.error(err);
    say("Не получилось: " + (err && err.message ? err.message : err));
  }
}

let saveTimer;
function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSettings(state).catch(console.error), 150);
}

function fillControls() {
  $("visible").checked = state.visible;
  $("opacity").value = Math.round(state.opacity * 100);
  $("size").value = Math.round(state.size * 100);
  $("corner").value = state.corner;
  $("order").value = state.order;
  $("byName").checked = state.byName;
  $("start").value = state.start;
  $("opacityVal").textContent = Math.round(state.opacity * 100) + "%";
  $("sizeVal").textContent = Math.round(state.size * 100) + "%";
}

function bindControls() {
  $("visible").addEventListener("change", (e) => { state.visible = e.target.checked; queueSave(); });
  $("opacity").addEventListener("input", (e) => {
    state.opacity = Number(e.target.value) / 100;
    $("opacityVal").textContent = e.target.value + "%";
    queueSave();
  });
  $("size").addEventListener("input", (e) => {
    state.size = Number(e.target.value) / 100;
    $("sizeVal").textContent = e.target.value + "%";
    queueSave();
  });
  $("corner").addEventListener("change", (e) => { state.corner = e.target.value; queueSave(); });
  $("order").addEventListener("change", (e) => { state.order = e.target.value; queueSave(); });
  $("byName").addEventListener("change", (e) => { state.byName = e.target.checked; queueSave(); });
  $("start").addEventListener("change", (e) => {
    state.start = Math.max(1, Math.floor(Number(e.target.value)) || 1);
    e.target.value = state.start;
    queueSave();
  });

  $("btnNumber").addEventListener("click", () =>
    run(
      async () => {
        await saveSettings(state); // чтобы порядок и «Начинать с» применились сразу
        return numberItems(eligible);
      },
      (n) => (n ? `Пронумеровано: ${n}` : "У выбранных токенов уже есть номера")
    )
  );
  $("btnRenumber").addEventListener("click", () =>
    run(
      async () => {
        await saveSettings(state);
        return numberItems(eligible, { renumber: true });
      },
      (n) => `Перенумеровано: ${n}`
    )
  );
  $("btnClear").addEventListener("click", () =>
    run(() => clearNumbers(eligible), (n) => (n ? `Номера убраны: ${n}` : "У выбранных токенов нет номеров"))
  );

  // Убрать всё: два клика, чтобы не нажать случайно.
  let armed = false;
  let armTimer;
  const btn = $("btnClearAll");
  btn.addEventListener("click", () => {
    if (!armed) {
      armed = true;
      btn.textContent = "Точно убрать все номера?";
      armTimer = setTimeout(() => {
        armed = false;
        btn.textContent = "Убрать все номера на сцене";
      }, 3000);
      return;
    }
    clearTimeout(armTimer);
    armed = false;
    btn.textContent = "Убрать все номера на сцене";
    run(clearAllNumbers, (n) => (n ? `Убрано номеров: ${n}` : "На сцене нет номеров"));
  });
}

OBR.onReady(async () => {
  try {
    applyTheme(await OBR.theme.getTheme());
    OBR.theme.onChange(applyTheme);
  } catch (_) {
    /* тема не обязательна */
  }

  const role = await OBR.player.getRole();
  if (role !== "GM") {
    $("noGm").hidden = false;
    return;
  }

  state = await loadSettings();
  fillControls();
  bindControls();
  $("app").hidden = false;

  selection = (await OBR.player.getSelection()) || [];
  OBR.scene.isReady().then((ready) => ready && refreshSelection());
  OBR.player.onChange((player) => {
    selection = player.selection || [];
    refreshSelection().catch(console.error);
  });
});
