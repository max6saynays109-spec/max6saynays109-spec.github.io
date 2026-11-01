// Фоновая страница: рисует номера локальными подписями, которые существуют только в браузере мастера.
// Игрокам такие подписи не передаются вообще, поэтому скрывать их от игроков не нужно.

import { OBR, buildText, loadSettings, numberItems, clearNumbers } from "./shared.js";
import { NS, NUM_KEY, LABEL_KEY, SIG_KEY, SETTINGS_KEY, parseSettings, getNumber, layoutLabel } from "./logic.js";

const MENU_ID = `${NS}/menu`;

let role = "PLAYER";
let settings = parseSettings({});

const isLabel = (item) => item.metadata && item.metadata[LABEL_KEY] !== undefined;

function buildLabel(tokenId, L) {
  return buildText()
    .textType("PLAIN")
    .plainText(String(L.number))
    .width(L.width)
    .height(L.height)
    .fontSize(L.fontSize)
    .fontWeight(700)
    .textAlign("CENTER")
    .textAlignVertical("MIDDLE")
    .padding(0)
    .fillColor("#ffffff")
    .fillOpacity(L.opacity)
    .strokeColor("#000000")
    .strokeOpacity(L.opacity)
    .strokeWidth(L.strokeWidth)
    .position({ x: L.x, y: L.y })
    .layer("TEXT")
    .locked(true)
    .disableHit(true) // клики проходят сквозь подпись к токену
    .metadata({ [LABEL_KEY]: tokenId, [SIG_KEY]: L.sig })
    .build();
}

async function deleteAllLabels() {
  const old = await OBR.scene.local.getItems(isLabel);
  if (old.length) await OBR.scene.local.deleteItems(old.map((i) => i.id));
}

async function doSync() {
  const ready = await OBR.scene.isReady();
  if (!ready || role !== "GM" || !settings.visible) {
    if (ready) await deleteAllLabels();
    return;
  }

  const dpi = await OBR.scene.grid.getDpi();
  const tokens = await OBR.scene.items.getItems((i) => i.type === "IMAGE" && getNumber(i) !== undefined);

  const wanted = new Map();
  for (const t of tokens) wanted.set(t.id, layoutLabel(t, dpi, settings));

  // Сверяем уже нарисованные подписи с тем, что должно быть.
  const existing = await OBR.scene.local.getItems(isLabel);
  const have = new Map();
  const kill = [];
  for (const e of existing) {
    const tid = e.metadata[LABEL_KEY];
    if (!wanted.has(tid) || have.has(tid)) kill.push(e.id);
    else have.set(tid, e);
  }
  for (const [tid, e] of [...have]) {
    if (e.metadata[SIG_KEY] !== wanted.get(tid).sig) {
      kill.push(e.id);
      have.delete(tid);
    }
  }
  if (kill.length) await OBR.scene.local.deleteItems(kill);

  const toAdd = [];
  for (const [tid, L] of wanted) if (!have.has(tid)) toAdd.push(buildLabel(tid, L));
  if (toAdd.length) await OBR.scene.local.addItems(toAdd);

  const toMove = [];
  for (const [tid, e] of have) {
    const L = wanted.get(tid);
    if (Math.abs(e.position.x - L.x) > 0.01 || Math.abs(e.position.y - L.y) > 0.01) toMove.push(e);
  }
  if (toMove.length) {
    await OBR.scene.local.updateItems(toMove, (drafts) => {
      for (const d of drafts) {
        const L = wanted.get(d.metadata[LABEL_KEY]);
        if (L) d.position = { x: L.x, y: L.y };
      }
    });
  }
}

// Синхронизации идут строго по одной; если во время работы пришло новое событие, повторяем ещё раз.
let running = false;
let again = false;
async function requestSync() {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      try {
        await doSync();
      } catch (err) {
        console.error("[token-numbers] sync failed", err);
      }
    } while (again);
  } finally {
    running = false;
  }
}

// Пункт в контекстном меню токена (правый клик): быстро добавить или убрать номер.
function setupContextMenu() {
  try {
    OBR.contextMenu.remove(MENU_ID);
  } catch (_) {
    /* меню ещё не было создано */
  }
  if (role !== "GM") return;
  try {
    OBR.contextMenu.create({
      id: MENU_ID,
      icons: [
        {
          icon: "/add.svg",
          label: "Пронумеровать",
          filter: {
            every: [
              { key: "layer", value: "CHARACTER" },
              { key: ["metadata", NUM_KEY], value: undefined },
            ],
          },
        },
        {
          icon: "/remove.svg",
          label: "Убрать номер",
          filter: {
            every: [{ key: "layer", value: "CHARACTER" }],
            some: [{ key: ["metadata", NUM_KEY], operator: "!=", value: undefined }],
          },
        },
      ],
      async onClick(context) {
        try {
          const ids = context.items.map((i) => i.id);
          if (context.items.some((i) => getNumber(i) !== undefined)) await clearNumbers(ids);
          else await numberItems(ids);
        } catch (err) {
          console.error("[token-numbers] context menu failed", err);
        }
      },
    });
  } catch (err) {
    console.error("[token-numbers] context menu setup failed", err);
  }
}

OBR.onReady(async () => {
  role = await OBR.player.getRole();
  settings = await loadSettings();
  setupContextMenu();

  OBR.player.onChange((player) => {
    if (player.role !== role) {
      role = player.role;
      setupContextMenu();
      requestSync();
    }
  });
  OBR.room.onMetadataChange((metadata) => {
    settings = parseSettings(metadata);
    requestSync();
  });
  OBR.scene.onReadyChange(() => requestSync());
  OBR.scene.items.onChange(() => requestSync());
  OBR.scene.grid.onChange(() => requestSync());

  requestSync();
});
