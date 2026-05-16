const filterButtons = document.querySelectorAll(".filter-button");
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
const closeLightbox = document.querySelector(".close-lightbox");

let activeFilter = "all";
let revealObserver;
let galleryPhotos = [];

function createPhotoCard(photo, isHero = false) {
  const button = document.createElement("button");
  const layout = isHero ? "hero-photo" : photo.layout || "";
  button.className = ["photo-card", layout, isHero ? "" : "reveal"].filter(Boolean).join(" ");
  button.type = "button";
  button.dataset.category = photo.category;
  button.dataset.title = photo.title;
  button.dataset.meta = photo.meta;

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

function setHero(photo) {
  heroCard.dataset.category = photo.category;
  heroCard.dataset.title = photo.title;
  heroCard.dataset.meta = photo.meta;
  heroCard.querySelector("img").src = photo.src;
  heroCard.querySelector("img").alt = photo.title;
  heroCard.querySelector("strong").textContent = photo.title;
  heroCard.querySelector("small").textContent = photo.meta;
  heroCard.onclick = () => showLightbox(photo);
}

function getHeroPhoto(filter) {
  if (filter === "all") {
    return galleryPhotos.find((photo) => photo.featured) || galleryPhotos[0];
  }

  return galleryPhotos.find((photo) => photo.category === filter) || getHeroPhoto("all");
}

function renderGallery(photos) {
  galleryPhotos = photos;
  gallery.innerHTML = "";
  const featured = getHeroPhoto("all");
  setHero(featured);

  photos
    .filter((photo) => photo !== featured)
    .forEach((photo) => {
      gallery.append(createPhotoCard(photo));
    });

  setupRevealObserver();
  applyFilter(activeFilter);
}

function applyFilter(filter) {
  activeFilter = filter;
  setHero(getHeroPhoto(filter));

  document.querySelectorAll(".gallery .photo-card").forEach((card) => {
    const shouldShow = filter === "all" || card.dataset.category === filter;
    card.classList.toggle("is-hidden", !shouldShow);
  });
}

function showLightbox(photo) {
  lightboxImage.src = photo.src;
  lightboxImage.alt = photo.title;
  lightboxTitle.textContent = photo.title;
  lightboxMeta.textContent = photo.meta;
  lightbox.hidden = false;
  document.body.classList.add("has-lightbox");
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

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    applyFilter(button.dataset.filter);
  });
});

infoButton.addEventListener("click", showInfoPanel);
closeInfo.addEventListener("click", hideInfoPanel);
panelScrim.addEventListener("click", hideInfoPanel);
closeLightbox.addEventListener("click", hideLightbox);

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
