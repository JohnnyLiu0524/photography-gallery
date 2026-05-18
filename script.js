const filterDock = document.querySelector(".filter-dock");
const gallery = document.querySelector(".gallery");
const heroCard = document.querySelector(".hero-photo");
const infoButton = document.querySelector(".info-button");
const infoPanel = document.querySelector(".info-panel");
const closeInfo = document.querySelector(".close-info");
const panelScrim = document.querySelector(".panel-scrim");
const lightbox = document.querySelector(".lightbox");
const lightboxImage = lightbox.querySelector("img");
const lightboxTitle = lightbox.querySelector("strong");
const lightboxMeta = lightbox.querySelector("span");
const lightboxCount = lightbox.querySelector("small");
const closeLightbox = document.querySelector(".close-lightbox");
const prevLightbox = document.querySelector(".lightbox-prev");
const nextLightbox = document.querySelector(".lightbox-next");
const heroCaption = document.querySelector(".hero-caption");

let activeFilter = "all";
let revealObserver;
let galleryPhotos = [];
let galleryCategories = [];
let currentLightboxPhotos = [];
let currentLightboxIndex = 0;

function labelFromCategory(category) {
  return category
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getCategoriesFromPhotos(photos) {
  const categories = [];
  const seen = new Set();

  photos.forEach((photo) => {
    if (!photo.category || seen.has(photo.category)) {
      return;
    }

    seen.add(photo.category);
    categories.push({
      id: photo.category,
      label: labelFromCategory(photo.category),
      meta: photo.meta || `${labelFromCategory(photo.category)} / Photo Frame`,
    });
  });

  return categories;
}

function mergeCategories(configuredCategories, photoCategories) {
  const categories = [];
  const seen = new Set();

  [...configuredCategories, ...photoCategories].forEach((category) => {
    if (!category?.id || seen.has(category.id)) {
      return;
    }

    seen.add(category.id);
    categories.push(category);
  });

  return categories;
}

function renderFilterButtons() {
  filterDock.innerHTML = "";

  const filters = [{ id: "all", label: "All" }, ...galleryCategories];

  filters.forEach((filter) => {
    const button = document.createElement("button");
    button.className = `filter-button${filter.id === activeFilter ? " is-active" : ""}`;
    button.type = "button";
    button.dataset.filter = filter.id;
    button.append(document.createTextNode(`${filter.label} `));
    button.append(document.createElement("small"));
    button.addEventListener("click", () => {
      setActiveFilterButton(button);
      applyFilter(button.dataset.filter);
      scrollToTop();
    });
    filterDock.append(button);
  });
}

function getCuratedLayout(photo, index) {
  if (photo.layout === "tall") {
    return "tall";
  }

  if (photo.layout === "wide") {
    return "wide";
  }

  if (photo.layout === "large" || photo.layout === "feature") {
    return "large";
  }

  if (photo.layout === "standard") {
    return "standard";
  }

  if (index % 10 === 0) {
    return "large";
  }

  if (index % 4 === 0) {
    return "standard";
  }

  return photo.layout || "standard";
}

function getPhotosForFilter(filter) {
  return filter === "all"
    ? galleryPhotos
    : galleryPhotos.filter((photo) => photo.category === filter);
}

function createPhotoCard(photo, isHero = false, index = 0) {
  const button = document.createElement("button");
  const layout = isHero ? "hero-photo" : getCuratedLayout(photo, index);
  const rotation = normalizeRotation(photo.rotation);
  button.className = ["photo-card", layout, isHero ? "" : "reveal"].filter(Boolean).join(" ");
  button.type = "button";
  button.dataset.category = photo.category;
  button.dataset.title = photo.title;
  button.dataset.meta = photo.meta;
  button.style.setProperty("--photo-rotation", `${rotation}deg`);
  button.classList.toggle("is-rotated", rotation === 90 || rotation === 270);

  const image = document.createElement("img");
  image.src = photo.src;
  image.alt = photo.title;
  image.loading = isHero ? "eager" : "lazy";

  const caption = document.createElement("span");
  const title = document.createElement("strong");
  const meta = document.createElement("small");
  title.textContent = photo.title;
  meta.textContent = photo.meta;
  caption.append(title, meta);
  button.append(image, caption);

  button.addEventListener("click", () => showLightbox(photo));
  return button;
}

function normalizeRotation(rotation) {
  const value = Number(rotation || 0);
  return [0, 90, 180, 270].includes(value) ? value : 0;
}

function setHero(photo) {
  const rotation = normalizeRotation(photo.rotation);
  heroCard.dataset.category = photo.category;
  heroCard.dataset.title = photo.title;
  heroCard.dataset.meta = photo.meta;
  heroCard.style.setProperty("--photo-rotation", `${rotation}deg`);
  heroCard.classList.toggle("is-rotated", rotation === 90 || rotation === 270);
  heroCard.querySelector("img").src = photo.src;
  heroCard.querySelector("img").alt = photo.title;
  heroCard.querySelector("strong").textContent = photo.title;
  heroCard.querySelector("small").textContent = photo.meta;
  heroCard.onclick = () => showLightbox(photo);

  if (heroCaption) {
    heroCaption.querySelector("h1").textContent = photo.title;
    heroCaption.querySelector("p:not(.eyebrow)").textContent = photo.meta;
  }
}

function getHeroPhoto(filter) {
  if (filter === "all") {
    return galleryPhotos.find((photo) => photo.featured) || galleryPhotos[0];
  }

  return (
    galleryPhotos.find((photo) => photo.category === filter && photo.featured) ||
    galleryPhotos.find((photo) => photo.category === filter) ||
    getHeroPhoto("all")
  );
}

function renderGallery(photos) {
  galleryPhotos = photos;
  galleryCategories = mergeCategories(
    Array.isArray(window.CATEGORIES) ? window.CATEGORIES : [],
    getCategoriesFromPhotos(photos)
  );
  gallery.innerHTML = "";
  renderFilterButtons();
  const featured = getHeroPhoto("all");
  setHero(featured);
  updateFilterCounts();

  photos
    .filter((photo) => photo !== featured)
    .forEach((photo, index) => {
      gallery.append(createPhotoCard(photo, false, index));
    });

  setupRevealObserver();
  applyFilter(activeFilter);
}

function updateFilterCounts() {
  const counts = galleryPhotos.reduce(
    (result, photo) => {
      result.all += 1;
      result[photo.category] = (result[photo.category] || 0) + 1;
      return result;
    },
    { all: 0 }
  );

  document.querySelectorAll(".filter-button").forEach((button) => {
    const count = counts[button.dataset.filter] || 0;
    const countLabel = button.querySelector("small");

    if (countLabel) {
      countLabel.textContent = count;
    }
  });
}

function applyFilter(filter) {
  activeFilter = filter;
  setHero(getHeroPhoto(filter));

  document.querySelectorAll(".gallery .photo-card").forEach((card) => {
    const shouldShow = filter === "all" || card.dataset.category === filter;
    card.classList.toggle("is-hidden", !shouldShow);
  });
}

function scrollToTop() {
  if (typeof window.scrollTo === "function") {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    return;
  }

  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function setActiveFilterButton(activeButton) {
  document.querySelectorAll(".filter-button").forEach((item) => item.classList.remove("is-active"));
  activeButton.classList.add("is-active");
}

function showLightbox(photo) {
  currentLightboxPhotos = getPhotosForFilter(activeFilter);
  currentLightboxIndex = Math.max(0, currentLightboxPhotos.indexOf(photo));
  setLightboxPhoto(currentLightboxPhotos[currentLightboxIndex] || photo);
  lightbox.hidden = false;
  document.body.classList.add("has-lightbox");
}

function setLightboxPhoto(photo) {
  const rotation = normalizeRotation(photo.rotation);
  lightboxImage.src = photo.src;
  lightboxImage.alt = photo.title;
  lightboxImage.style.setProperty("--photo-rotation", `${rotation}deg`);
  lightboxImage.classList.toggle("is-rotated", rotation === 90 || rotation === 270);
  lightboxTitle.textContent = photo.title;
  lightboxMeta.textContent = photo.meta;

  if (lightboxCount) {
    lightboxCount.textContent = `${currentLightboxIndex + 1} / ${currentLightboxPhotos.length}`;
  }
}

function stepLightbox(direction) {
  if (lightbox.hidden || currentLightboxPhotos.length === 0) {
    return;
  }

  currentLightboxIndex =
    (currentLightboxIndex + direction + currentLightboxPhotos.length) % currentLightboxPhotos.length;
  setLightboxPhoto(currentLightboxPhotos[currentLightboxIndex]);
}

function hideLightbox() {
  lightbox.hidden = true;
  lightboxImage.src = "";
  document.body.classList.remove("has-lightbox");
}

function showInfoPanel() {
  infoPanel.classList.add("is-open");
  infoPanel.setAttribute("aria-hidden", "false");
  infoButton.setAttribute("aria-expanded", "true");
  panelScrim.hidden = false;
  document.body.classList.add("has-panel");
}

function hideInfoPanel() {
  infoPanel.classList.remove("is-open");
  infoPanel.setAttribute("aria-hidden", "true");
  infoButton.setAttribute("aria-expanded", "false");
  panelScrim.hidden = true;
  document.body.classList.remove("has-panel");
}

function setupRevealObserver() {
  if (revealObserver) {
    revealObserver.disconnect();
  }

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 }
  );

  document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));
}

infoButton.addEventListener("click", showInfoPanel);
closeInfo.addEventListener("click", hideInfoPanel);
panelScrim.addEventListener("click", hideInfoPanel);
closeLightbox.addEventListener("click", hideLightbox);
prevLightbox?.addEventListener("click", () => stepLightbox(-1));
nextLightbox?.addEventListener("click", () => stepLightbox(1));

lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) {
    hideLightbox();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!lightbox.hidden) {
      hideLightbox();
    }

    if (infoPanel.classList.contains("is-open")) {
      hideInfoPanel();
    }
  }

  if (event.key === "ArrowLeft") {
    stepLightbox(-1);
  }

  if (event.key === "ArrowRight") {
    stepLightbox(1);
  }
});

if (Array.isArray(window.PHOTOS)) {
  renderGallery(window.PHOTOS);
} else {
  fetch("photos.json")
    .then((response) => response.json())
    .then(renderGallery)
    .catch(() => {
      gallery.innerHTML = '<p class="load-error">Photos could not be loaded.</p>';
    });
}
