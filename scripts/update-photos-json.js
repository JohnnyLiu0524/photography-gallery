const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const photosDir = path.join(root, "photos");
const jsonPath = path.join(root, "photos.json");
const dataPath = path.join(root, "photos-data.js");
const categoriesPath = path.join(root, "categories.json");
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function toWebPath(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return walkFiles(fullPath);
    }

    if (entry.isFile() && allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
      return [fullPath];
    }

    return [];
  });
}

function readExistingPhotos() {
  if (!fs.existsSync(jsonPath)) {
    return [];
  }

  return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
}

function readCategories() {
  if (!fs.existsSync(categoriesPath)) {
    return [
      { id: "city", meta: "City / Urban Frame" },
      { id: "nature", meta: "Nature / Outdoor Frame" },
      { id: "people", meta: "People / Human Moment" },
    ];
  }

  return JSON.parse(fs.readFileSync(categoriesPath, "utf8"));
}

function readImageSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".png" && buffer.toString("ascii", 1, 4) === "PNG") {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if ((ext === ".jpg" || ext === ".jpeg") && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;

    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      const isStartOfFrame =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

      if (isStartOfFrame) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }

      offset += 2 + length;
    }
  }

  return null;
}

function inferCategory(src) {
  const parts = src.split("/");
  const folder = parts.length > 2 ? parts[1].toLowerCase() : "";
  return knownCategories.has(folder) ? folder : "everyday";
}

function normalizeLayout(layout) {
  if (layout === "horizon") {
    return "wide";
  }

  if (layout === "portrait") {
    return "tall";
  }

  if (layout === "feature") {
    return "large";
  }

  if (["standard", "wide", "tall", "large"].includes(layout)) {
    return layout;
  }

  return "";
}

function normalizeRotation(rotation) {
  const value = Number(rotation || 0);
  return [0, 90, 180, 270].includes(value) ? value : 0;
}

function titleFromIndex(index) {
  return `Photo ${String(index).padStart(3, "0")}`;
}

function metaForCategory(category) {
  return categories.find((entry) => entry.id === category)?.meta || "Photo / Gallery Frame";
}

const categories = readCategories();
const knownCategories = new Set(categories.map((category) => category.id));
const existingPhotos = readExistingPhotos();
const existingBySrc = new Map(existingPhotos.map((photo) => [photo.src, photo]));
const files = walkFiles(photosDir).sort((a, b) => toWebPath(a).localeCompare(toWebPath(b)));
const fileBySrc = new Map(files.map((file) => [toWebPath(file), file]));

const keptPhotos = existingPhotos
  .filter((photo) => fileBySrc.has(photo.src))
  .map((photo) => ({
    ...photo,
    layout: normalizeLayout(photo.layout),
    rotation: normalizeRotation(photo.rotation),
  }));

const nextPhotos = [...keptPhotos];

for (const file of files) {
  const src = toWebPath(file);

  if (existingBySrc.has(src)) {
    continue;
  }

  const category = inferCategory(src);
  nextPhotos.push({
    src,
    category,
    title: titleFromIndex(nextPhotos.length + 1),
    meta: metaForCategory(category),
    layout: "",
    rotation: 0,
  });
}

if (nextPhotos.length > 0 && !nextPhotos.some((photo) => photo.featured)) {
  nextPhotos[0].featured = true;
}

const json = JSON.stringify(nextPhotos, null, 2);
fs.writeFileSync(jsonPath, `${json}\n`);
fs.writeFileSync(dataPath, `window.PHOTOS = ${json};\n`);

const added = nextPhotos.length - keptPhotos.length;
const removed = existingPhotos.length - keptPhotos.length;
console.log(`photos updated: ${nextPhotos.length} photos (${added} added, ${removed} removed).`);
