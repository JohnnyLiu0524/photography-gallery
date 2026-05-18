const list = document.querySelector(".photo-list");
const template = document.querySelector("#photo-card-template");
const fileInput = document.querySelector(".file-input");
const saveButton = document.querySelector(".save-button");
const statusMessage = document.querySelector(".status-message");
const photoCount = document.querySelector(".photo-count");
const categoryForm = document.querySelector(".category-form");
const categoryList = document.querySelector(".category-list");
const maxSingleUploadBytes = 50 * 1024 * 1024;

let photos = [];
let categories = [];
let draggedItem = null;
let dirty = false;

function setStatus(message) {
  statusMessage.textContent = message;
}

function setDirty(value = true) {
  dirty = value;
  saveButton.textContent = dirty ? "Save Changes" : "Saved";
}

function updateCount() {
  photoCount.textContent = `${photos.length} photo${photos.length === 1 ? "" : "s"}`;
}

function normalizePhoto(photo) {
  const fallbackCategory = categories[0]?.id || "nature";

  return {
    src: photo.src,
    category: photo.category || fallbackCategory,
    title: photo.title || "Untitled",
    meta: photo.meta || "",
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

function slugifyCategory(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function labelFromCategory(category) {
  return category
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function getCategoriesFromPhotos(photoList) {
  const seen = new Set();
  const nextCategories = [];

  photoList.forEach((photo) => {
    if (!photo.category || seen.has(photo.category)) {
      return;
    }

    seen.add(photo.category);
    nextCategories.push({
      id: photo.category,
      label: labelFromCategory(photo.category),
      meta: photo.meta || `${labelFromCategory(photo.category)} / Photo Frame`,
    });
  });

  return nextCategories;
}

function mergeCategories(configuredCategories, photoCategories) {
  const merged = [];
  const seen = new Set();

  [...configuredCategories, ...photoCategories].forEach((category) => {
    const normalized = normalizeCategory(category);

    if (!normalized || seen.has(normalized.id)) {
      return;
    }

    seen.add(normalized.id);
    merged.push(normalized);
  });

  return merged;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Admin API is not available. Start it with: npm run admin");
  }

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

async function loadPhotos() {
  setStatus("Loading photos...");
  const payload = await api("/api/photos");
  categories = mergeCategories(payload.categories || [], getCategoriesFromPhotos(payload.photos));
  photos = payload.photos.map(normalizePhoto);
  render();
  setDirty(false);
  setStatus("Ready.");
}

function render() {
  list.innerHTML = "";
  updateCount();
  renderCategories();

  photos.forEach((photo, index) => {
    const item = template.content.firstElementChild.cloneNode(true);
    item.dataset.index = index;
    item.querySelector("img").src = photo.src;
    item.querySelector("img").alt = photo.title;

    for (const field of ["title", "category", "meta", "layout", "rotation"]) {
      const input = item.querySelector(`[name="${field}"]`);
      if (field === "category") {
        renderCategoryOptions(input, photo.category);
      }
      input.value = field === "rotation" ? String(photo[field] || 0) : photo[field] || "";
      input.addEventListener("input", () => {
        photos[index][field] = field === "rotation" ? normalizeRotation(input.value) : input.value;
        setDirty();
      });
    }

    const featured = item.querySelector('[name="featured"]');
    featured.checked = !!photo.featured;
    featured.addEventListener("change", () => {
      if (featured.checked) {
        photos = photos.map((entry, photoIndex) => ({
          ...entry,
          featured: photoIndex === index,
        }));
        render();
      } else {
        delete photos[index].featured;
      }

      setDirty();
    });

    item.querySelector(".delete-button").addEventListener("click", () => deletePhoto(photo));
    item.addEventListener("dragstart", () => {
      draggedItem = item;
      item.classList.add("is-dragging");
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("is-dragging");
      draggedItem = null;
      syncOrderFromDom();
    });
    item.addEventListener("dragover", (event) => {
      event.preventDefault();
      const target = event.currentTarget;

      if (!draggedItem || draggedItem === target) {
        return;
      }

      const rect = target.getBoundingClientRect();
      const shouldPlaceAfter = event.clientY > rect.top + rect.height / 2;
      list.insertBefore(draggedItem, shouldPlaceAfter ? target.nextSibling : target);
    });

    list.append(item);
  });
}

function renderCategoryOptions(select, selectedCategory) {
  select.innerHTML = "";

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.label;
    select.append(option);
  });

  if (selectedCategory && !categories.some((category) => category.id === selectedCategory)) {
    const option = document.createElement("option");
    option.value = selectedCategory;
    option.textContent = labelFromCategory(selectedCategory);
    select.append(option);
  }
}

function renderCategories() {
  categoryList.innerHTML = "";

  categories.forEach((category, index) => {
    const item = document.createElement("article");
    item.className = "category-item";

    const fields = document.createElement("div");
    fields.className = "category-fields";

    const id = document.createElement("span");
    id.className = "category-id";
    id.textContent = category.id;

    const label = document.createElement("input");
    label.type = "text";
    label.value = category.label;
    label.setAttribute("aria-label", `${category.label} label`);
    label.addEventListener("input", () => {
      categories[index].label = label.value;
      setDirty();
    });

    const meta = document.createElement("input");
    meta.type = "text";
    meta.value = category.meta;
    meta.setAttribute("aria-label", `${category.label} default meta`);
    meta.addEventListener("input", () => {
      categories[index].meta = meta.value;
      setDirty();
    });

    fields.append(id, label, meta);

    const remove = document.createElement("button");
    remove.className = "category-delete";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.disabled = categories.length <= 1;
    remove.addEventListener("click", () => deleteCategory(category));

    item.append(fields, remove);
    categoryList.append(item);
  });
}

function syncOrderFromDom() {
  const ordered = [...list.querySelectorAll(".photo-item")].map((item) => photos[Number(item.dataset.index)]);
  photos = ordered.map(normalizePhoto);
  render();
  setDirty();
}

async function savePhotos() {
  setStatus("Saving...");
  const payload = await api("/api/photos", {
    method: "POST",
    body: JSON.stringify({
      photos: photos.map(normalizePhoto),
      categories: categories.map(normalizeCategory).filter(Boolean),
    }),
  });
  categories = payload.categories.map(normalizeCategory).filter(Boolean);
  photos = payload.photos.map(normalizePhoto);
  render();
  setDirty(false);
  setStatus("Saved photos.json and photos-data.js.");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function uploadFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith("image/"));

  if (!files.length) {
    return;
  }

  let uploaded = 0;
  let skipped = 0;

  for (const file of files) {
    if (file.size > maxSingleUploadBytes) {
      skipped += 1;
      setStatus(`Skipped ${file.name}: file is larger than 50 MB.`);
      continue;
    }

    setStatus(`Uploading ${uploaded + 1} of ${files.length}: ${file.name}`);
    const payload = await api("/api/photos/upload", {
      method: "POST",
      body: JSON.stringify({
        files: [
          {
            name: file.name,
            type: file.type,
            data: await readFileAsDataUrl(file),
          },
        ],
      }),
    });

    photos = payload.photos.map(normalizePhoto);
    if (payload.categories?.length) {
      categories = payload.categories.map(normalizeCategory).filter(Boolean);
    }
    uploaded += payload.added.length;
    render();
  }

  setDirty(false);
  setStatus(
    `Uploaded ${uploaded} new photo${uploaded === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} oversized file${skipped === 1 ? "" : "s"}` : ""}.`
  );
}

async function deletePhoto(photo) {
  const confirmed = window.confirm(`Delete "${photo.title}" from the gallery and remove the image file?`);

  if (!confirmed) {
    return;
  }

  setStatus("Deleting photo...");
  const payload = await api("/api/photos/delete", {
    method: "POST",
    body: JSON.stringify({ src: photo.src }),
  });
  photos = payload.photos.map(normalizePhoto);
  render();
  setDirty(false);
  setStatus("Deleted photo and saved gallery data.");
}

function addCategory(label) {
  const id = slugifyCategory(label);

  if (!id) {
    setStatus("Enter a category name.");
    return;
  }

  if (categories.some((category) => category.id === id)) {
    setStatus("That category already exists.");
    return;
  }

  categories.push({
    id,
    label: label.trim(),
    meta: `${label.trim()} / Photo Frame`,
  });
  render();
  setDirty();
  setStatus(`Added category: ${label.trim()}.`);
}

function deleteCategory(category) {
  if (categories.length <= 1) {
    setStatus("Keep at least one category.");
    return;
  }

  const replacement = categories.find((entry) => entry.id !== category.id);
  const affected = photos.filter((photo) => photo.category === category.id).length;
  const confirmed = window.confirm(
    affected
      ? `Delete "${category.label}" and move ${affected} photo${affected === 1 ? "" : "s"} to "${replacement.label}"?`
      : `Delete "${category.label}"?`
  );

  if (!confirmed) {
    return;
  }

  categories = categories.filter((entry) => entry.id !== category.id);
  photos = photos.map((photo) =>
    photo.category === category.id
      ? { ...photo, category: replacement.id, meta: replacement.meta }
      : photo
  );
  render();
  setDirty();
  setStatus(`Deleted category: ${category.label}.`);
}

fileInput.addEventListener("change", () => {
  uploadFiles(fileInput.files).catch((error) => setStatus(error.message));
  fileInput.value = "";
});

saveButton.addEventListener("click", () => {
  savePhotos().catch((error) => setStatus(error.message));
});

categoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = categoryForm.elements.label;
  addCategory(input.value);
  input.value = "";
});

window.addEventListener("beforeunload", (event) => {
  if (!dirty) {
    return;
  }

  event.preventDefault();
  event.returnValue = "";
});

loadPhotos().catch((error) => {
  setStatus(error.message);
});
