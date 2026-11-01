// Чистая логика без зависимости от SDK Owlbear Rodeo (поэтому её легко проверить отдельно).

export const NS = "com.gm-tools.token-numbers";
export const NUM_KEY = `${NS}/number`; // номер, сохранённый в метаданных токена
export const LABEL_KEY = `${NS}/label-for`; // у локальной подписи: id токена, к которому она относится
export const SIG_KEY = `${NS}/sig`; // у локальной подписи: «отпечаток» вида (текст, размер, прозрачность)
export const SETTINGS_KEY = `${NS}/settings`; // настройки в метаданных комнаты

export const DEFAULTS = {
  visible: true, // показывать номера мастеру
  opacity: 0.55, // прозрачность подписи (0.1 – 1)
  size: 0.26, // высота подписи как доля от меньшей стороны токена
  corner: "tl", // tl | tr | bl | br
  byName: false, // считать отдельно для каждого имени токена
  order: "reading", // reading | selection
  start: 1, // минимальный стартовый номер
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function parseSettings(metadata) {
  const raw = (metadata && metadata[SETTINGS_KEY]) || {};
  const s = { ...DEFAULTS };
  if (typeof raw.visible === "boolean") s.visible = raw.visible;
  if (Number.isFinite(raw.opacity)) s.opacity = clamp(raw.opacity, 0.1, 1);
  if (Number.isFinite(raw.size)) s.size = clamp(raw.size, 0.1, 0.6);
  if (["tl", "tr", "bl", "br"].includes(raw.corner)) s.corner = raw.corner;
  if (typeof raw.byName === "boolean") s.byName = raw.byName;
  if (["reading", "selection"].includes(raw.order)) s.order = raw.order;
  if (Number.isFinite(raw.start)) s.start = Math.max(1, Math.floor(raw.start));
  return s;
}

// Токен — это картинка не на слое карты.
export function isToken(item) {
  return item.type === "IMAGE" && item.layer !== "MAP";
}

export function getNumber(item) {
  const n = item.metadata && item.metadata[NUM_KEY];
  return Number.isFinite(n) ? n : undefined;
}

// Решает, какой номер получит каждый токен из targets.
// renumber = false: нумеруются только токены без номера, счёт продолжается с максимального существующего.
// renumber = true: выбранные токены нумеруются заново (их старые номера не учитываются).
export function planNumbers({ targets, allItems, settings, dpi, renumber }) {
  const targetIds = new Set(targets.map((t) => t.id));
  const groupOf = (it) => (settings.byName ? it.name || "" : "");

  const maxByGroup = new Map();
  for (const it of allItems) {
    if (!isToken(it)) continue;
    if (renumber && targetIds.has(it.id)) continue;
    const n = getNumber(it);
    if (n === undefined) continue;
    const g = groupOf(it);
    maxByGroup.set(g, Math.max(maxByGroup.get(g) ?? 0, n));
  }

  const list = renumber ? targets.slice() : targets.filter((t) => getNumber(t) === undefined);

  if (settings.order === "reading") {
    const cell = dpi || 150;
    list.sort((a, b) => {
      const ra = Math.round(a.position.y / cell);
      const rb = Math.round(b.position.y / cell);
      return ra - rb || a.position.x - b.position.x;
    });
  }

  const result = new Map();
  for (const t of list) {
    const g = groupOf(t);
    const next = Math.max(maxByGroup.get(g) ?? 0, settings.start - 1) + 1;
    maxByGroup.set(g, next);
    result.set(t.id, next);
  }
  return result;
}

// Считает, где и какого размера должна быть подпись для токена.
// Подпись всегда горизонтальная, но её положение учитывает поворот токена.
export function layoutLabel(token, dpi, s) {
  const n = getNumber(token);
  const rx = (Math.abs(token.scale.x) * dpi) / token.grid.dpi;
  const ry = (Math.abs(token.scale.y) * dpi) / token.grid.dpi;
  const w = token.image.width * rx;
  const h = token.image.height * ry;
  const ox = token.grid.offset.x * rx;
  const oy = token.grid.offset.y * ry;

  const short = Math.min(w, h);
  const boxH = Math.max(8, short * s.size);
  const digits = String(n).length;
  const boxW = boxH * Math.max(1, digits * 0.55);
  const margin = short * 0.03;

  const left = s.corner === "tl" || s.corner === "bl";
  const top = s.corner === "tl" || s.corner === "tr";

  // центр подписи относительно точки position токена (до поворота)
  const cx = left ? -ox + margin + boxW / 2 : w - ox - margin - boxW / 2;
  const cy = top ? -oy + margin + boxH / 2 : h - oy - margin - boxH / 2;

  const rad = ((token.rotation || 0) * Math.PI) / 180;
  const dx = cx * Math.cos(rad) - cy * Math.sin(rad);
  const dy = cx * Math.sin(rad) + cy * Math.cos(rad);

  const x = token.position.x + dx - boxW / 2;
  const y = token.position.y + dy - boxH / 2;
  const fontSize = boxH * 0.75;
  const strokeWidth = Math.max(1, fontSize * 0.12);
  const opacity = s.opacity;
  const sig = [n, Math.round(boxW), Math.round(boxH), Math.round(fontSize), opacity].join("|");

  return { number: n, x, y, width: boxW, height: boxH, fontSize, strokeWidth, opacity, sig };
}
