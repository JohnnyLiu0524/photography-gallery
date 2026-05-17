const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const root = path.resolve(__dirname, "..");
const photosDir = path.join(root, "photos");
const jsonPath = path.join(root, "photos.json");
const dataPath = path.join(root, "photos-data.js");
const categoriesPath = path.join(root, "categories.json");
const categoriesDataPath = path.join(root, "categories-data.js");
const port = Number(process.env.PORT || 4173);
const host = "127.0.0.1";
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const maxUploadBytes = 80 * 1024 * 1024;
const defaultCategories = [
  { id: "city", label: "City", meta: "City / Urban Frame" },
  { id: "nature", label: "Nature", meta: "Nature / Outdoor Frame" },
  { id: "people", label: "People", meta: "People / Human Moment" },
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function toWebPath(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function fromWebPath(src) {
  const resolved = path.resolve(root, src);

  if (!resolved.startsWith(root)) {
    throw new Error("Path is outside project root.");
  }

  return resolved;
}

function readPhotos() {
  if (!fs.existsSync(jsonPath)) {
    return [];
  }

  return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
}

function slugifyCategory(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCategory(category) {
  const label = String(category.label || category.id || "").trim();
  const id = slugifyCategory(category.id || label);

  if (!id || !label) {
    return null;
  }

  return {
    id,
    label,
    meta: String(category.meta || `${label} / Photo Frame`).trim(),
  };
}

function dedupeCategories(categories) {
  const seen = new Set();
  const normalized = [];

  for (const category of categories) {
    const nextCategory = normalizeCategory(category);

    if (!nextCategory || seen.has(nextCategory.id)) {
      continue;
    }

    seen.add(nextCategory.id);
    normalized.push(nextCategory);
  }

  return normalized.length ? normalized : [...defaultCategories];
}

function readCategories() {
  if (!fs.existsSync(categoriesPath)) {
    return [...defaultCategories];
  }

  return dedupeCategories(JSON.parse(fs.readFileSync(categoriesPath, "utf8")));
}

function writeCategories(categories) {
  const normalized = dedupeCategories(categories);
  const json = JSON.stringify(normalized, null, 2);
  fs.writeFileSync(categoriesPath, `${json}\n`);
  fs.writeFileSync(categoriesDataPath, `window.CATEGORIES = ${json};\n`);
  return normalized;
}

function getCategoriesFromPhotos(photos) {
  const seen = new Set();
  const categories = [];

  for (const photo of photos) {
    if (!photo.category || seen.has(photo.category)) {
      continue;
    }

    seen.add(photo.category);
    categories.push({
      id: photo.category,
      label: photo.category
        .split("-")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
      meta: photo.meta || "Photo / Gallery Frame",
    });
  }

  return categories;
}

function mergeCategories(configuredCategories, photoCategories) {
  const seen = new Set();
  const merged = [];

  for (const category of [...configuredCategories, ...photoCategories]) {
    const normalized = normalizeCategory(category);

    if (!normalized || seen.has(normalized.id)) {
      continue;
    }

    seen.add(normalized.id);
    merged.push(normalized);
  }

  return merged;
}

function writePhotos(photos) {
  const normalized = photos.map(normalizePhoto);
  const json = JSON.stringify(normalized, null, 2);
  fs.writeFileSync(jsonPath, `${json}\n`);
  fs.writeFileSync(dataPath, `window.PHOTOS = ${json};\n`);
  return normalized;
}

function normalizePhoto(photo) {
  return {
    src: String(photo.src || "").trim(),
    category: String(photo.category || "nature").trim() || "nature",
    title: String(photo.title || "Untitled").trim() || "Untitled",
    meta: String(photo.meta || "").trim(),
    layout: normalizeLayout(photo.layout),
    rotation: normalizeRotation(photo.rotation),
    ...(photo.featured ? { featured: true } : {}),
  };
}

function normalizeRotation(rotation) {
  const value = Number(rotation || 0);
  return [0, 90, 180, 270].includes(value) ? value : 0;
}

function normalizeLayout(layout) {
  const value = String(layout || "").trim();

  if (value === "horizon") {
    return "wide";
  }

  if (value === "portrait") {
    return "tall";
  }

  if (value === "feature") {
    return "large";
  }

  if (["standard", "wide", "tall", "large"].includes(value)) {
    return value;
  }

  return "";
}

function metaForCategory(category) {
  return readCategories().find((entry) => entry.id === category)?.meta || "Photo / Gallery Frame";
}

function titleFromFilename(name) {
  const base = path.basename(name, path.extname(name));
  const words = base
    .replace(/^[a-f0-9]{16,}$/i, "Photo")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return words
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function readImageSize(buffer, ext) {
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

function safeUploadName(originalName, buffer, ext) {
  const hash = crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 16);
  const slug = path
    .basename(originalName, path.extname(originalName))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return `${hash}${slug ? `-${slug}` : ""}${ext}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;

      if (size > maxUploadBytes) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const body = await readBody(req);
  return body ? JSON.parse(body) : {};
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function serveStatic(req, res, url) {
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.resolve(root, `.${pathname}`);

  if (!filePath.startsWith(root)) {
    sendError(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendError(res, 404, "Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(data);
  });
}

function ensurePhotosDirectory() {
  fs.mkdirSync(photosDir, { recursive: true });
}

function uploadFiles(files) {
  ensurePhotosDirectory();

  const photos = readPhotos();
  const categories = readCategories();
  const defaultCategory = categories[0]?.id || "nature";
  const existingSrcs = new Set(photos.map((photo) => photo.src));
  const added = [];

  for (const file of files) {
    const ext = path.extname(file.name || "").toLowerCase();

    if (!allowedExtensions.has(ext)) {
      throw new Error(`Unsupported file type: ${file.name}`);
    }

    const data = String(file.data || "").replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(data, "base64");

    if (!buffer.length) {
      throw new Error(`Empty upload: ${file.name}`);
    }

    const filename = safeUploadName(file.name, buffer, ext);
    const targetPath = path.join(photosDir, filename);
    const src = toWebPath(targetPath);

    if (!fs.existsSync(targetPath)) {
      fs.writeFileSync(targetPath, buffer);
    }

    if (!existingSrcs.has(src)) {
      const category = file.category || defaultCategory;
      const photo = {
        src,
        category,
        title: file.title || titleFromFilename(file.name),
        meta: file.meta || metaForCategory(category),
        layout: file.layout ? normalizeLayout(file.layout) : "",
        rotation: normalizeRotation(file.rotation),
      };
      photos.push(photo);
      existingSrcs.add(src);
      added.push(photo);
    }
  }

  return { photos: writePhotos(photos), added };
}

function deletePhoto(src) {
  const photos = readPhotos();
  const nextPhotos = photos.filter((photo) => photo.src !== src);

  if (nextPhotos.length === photos.length) {
    throw new Error("Photo is not in photos.json.");
  }

  const filePath = fromWebPath(src);
  const normalizedPhotosDir = path.resolve(photosDir);

  if (!filePath.startsWith(normalizedPhotosDir)) {
    throw new Error("Refusing to delete a file outside photos/.");
  }

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  return writePhotos(nextPhotos);
}

async function handleApi(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname === "/api/photos") {
      const photos = readPhotos();
      sendJson(res, 200, {
        photos,
        categories: mergeCategories(readCategories(), getCategoriesFromPhotos(photos)),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/photos") {
      const body = await readJsonBody(req);
      const photos = Array.isArray(body) ? body : body.photos;
      const categories = Array.isArray(body.categories) ? writeCategories(body.categories) : readCategories();

      if (!Array.isArray(photos)) {
        sendError(res, 400, "Expected a photos array.");
        return;
      }

      sendJson(res, 200, { photos: writePhotos(photos), categories });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/categories") {
      sendJson(res, 200, { categories: readCategories() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/categories") {
      const body = await readJsonBody(req);
      const categories = Array.isArray(body) ? body : body.categories;

      if (!Array.isArray(categories)) {
        sendError(res, 400, "Expected a categories array.");
        return;
      }

      sendJson(res, 200, { categories: writeCategories(categories) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/photos/upload") {
      const body = await readJsonBody(req);
      const files = Array.isArray(body.files) ? body.files : [];

      if (!files.length) {
        sendError(res, 400, "Expected at least one file.");
        return;
      }

      sendJson(res, 200, uploadFiles(files));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/photos/delete") {
      const body = await readJsonBody(req);

      if (!body.src) {
        sendError(res, 400, "Expected src.");
        return;
      }

      sendJson(res, 200, { photos: deletePhoto(body.src) });
      return;
    }

    sendError(res, 404, "Unknown API endpoint.");
  } catch (error) {
    sendError(res, 500, error.message);
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`);

  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url);
    return;
  }

  serveStatic(req, res, url);
});

server.listen(port, host, () => {
  console.log(`Gallery admin running at http://${host}:${port}/admin.html`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the current preview server or run:`);
    console.error(`$env:PORT=4174; node scripts/admin-server.js`);
    return;
  }

  throw error;
});
