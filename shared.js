// Общие действия, которые используют и всплывающее окно, и фоновая страница.

import OBR, { buildText } from "https://esm.sh/@owlbear-rodeo/sdk@3";
import { NUM_KEY, SETTINGS_KEY, parseSettings, isToken, planNumbers, getNumber } from "./logic.js";

export { OBR, buildText };

export async function loadSettings() {
  return parseSettings(await OBR.room.getMetadata());
}

export async function saveSettings(settings) {
  await OBR.room.setMetadata({ [SETTINGS_KEY]: settings });
}

// getItems по списку id возвращает предметы в произвольном порядке, а нам важен порядок выделения.
async function fetchInOrder(ids) {
  if (!ids.length) return [];
  const found = await OBR.scene.items.getItems(ids);
  const byId = new Map(found.map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function numberItems(ids, { renumber = false } = {}) {
  const settings = await loadSettings();
  const dpi = await OBR.scene.grid.getDpi();
  const targets = (await fetchInOrder(ids)).filter(isToken);
  if (!targets.length) return 0;

  const allItems = await OBR.scene.items.getItems((i) => i.type === "IMAGE");
  const plan = planNumbers({ targets, allItems, settings, dpi, renumber });
  const changed = targets.filter((t) => plan.has(t.id));
  if (!changed.length) return 0;

  await OBR.scene.items.updateItems(changed, (drafts) => {
    for (const d of drafts) d.metadata[NUM_KEY] = plan.get(d.id);
  });
  return changed.length;
}

async function removeNumbersFrom(items) {
  if (!items.length) return 0;
  await OBR.scene.items.updateItems(items, (drafts) => {
    for (const d of drafts) delete d.metadata[NUM_KEY];
  });
  return items.length;
}

export async function clearNumbers(ids) {
  const items = (await fetchInOrder(ids)).filter((i) => getNumber(i) !== undefined);
  return removeNumbersFrom(items);
}

export async function clearAllNumbers() {
  const items = await OBR.scene.items.getItems((i) => i.type === "IMAGE" && getNumber(i) !== undefined);
  return removeNumbersFrom(items);
}
