const sb = window.sb;

// full list + filtered list
let allPhotos = [];
let photos = [];
let idx = 0;

let activeCategory = "All";

const frame = document.getElementById("frame");
const imgA = document.getElementById("imgA");
const imgB = document.getElementById("imgB");
const loadingOverlay = document.getElementById("loadingOverlay");

const thumbsEl = document.getElementById("thumbs");
const counterEl = document.getElementById("counter");

const filtersEl = document.getElementById("filters");

const caption = document.getElementById("caption");
const capTitle = document.getElementById("capTitle");
const capDesc = document.getElementById("capDesc");

const lightbox = document.getElementById("lightbox");
const lbImg = document.getElementById("lbImg");
const lbCaption = document.getElementById("lbCaption");
const lbTitle = document.getElementById("lbTitle");
const lbDesc = document.getElementById("lbDesc");

let showingA = true;

// Basic “count view once per browser session per photo”
const VIEW_KEY = "seaview_viewed_photo_ids";
const viewedSet = new Set(JSON.parse(localStorage.getItem(VIEW_KEY) || "[]"));

function saveViewedSet() {
  localStorage.setItem(VIEW_KEY, JSON.stringify(Array.from(viewedSet)));
}

function publicUrl(file_path) {
  const { data } = sb.storage.from("gallery").getPublicUrl(file_path);
  return data.publicUrl;
}

function showLoading(show) {
  if (!loadingOverlay) return;
  loadingOverlay.classList.toggle("show", !!show);
}

function setImages(url) {
  // Crossfade: load into hidden layer, then swap
  const incoming = showingA ? imgB : imgA;
  const outgoing = showingA ? imgA : imgB;

  showLoading(true);
  incoming.classList.remove("show");

  incoming.onload = () => {
    outgoing.classList.remove("show");
    incoming.classList.add("show");
    showingA = !showingA;
    showLoading(false);
  };

  incoming.onerror = () => {
    showLoading(false);
  };

  // cache-bust not needed for normal viewing, but safe to keep light:
  incoming.src = url;
}

function buildFilters() {
  if (!filtersEl) return;

  const cats = new Set();
  allPhotos.forEach(p => {
    const c = (p.category || "").trim();
    if (c) cats.add(c);
  });

  const list = ["All", ...Array.from(cats).sort((a, b) => a.localeCompare(b))];

  filtersEl.innerHTML = "";
  list.forEach(cat => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (cat === activeCategory ? " active" : "");
    btn.textContent = cat;

    btn.addEventListener("click", () => {
      activeCategory = cat;
      applyCategoryFilter();
    });

    filtersEl.appendChild(btn);
  });
}

function applyCategoryFilter() {
  if (activeCategory === "All") {
    photos = allPhotos.slice();
  } else {
    photos = allPhotos.filter(p => (p.category || "").trim() === activeCategory);
  }
  idx = 0;
  buildFilters();
  render();
}

async function incrementView(p) {
  if (!p?.id) return;
  if (viewedSet.has(p.id)) return;

  // Mark as viewed (so we don’t spam)
  viewedSet.add(p.id);
  saveViewedSet();

  // Prefer atomic RPC increment
  try {
    const { error } = await sb.rpc("increment_photo_views", { photo_id: p.id });
    if (error) throw error;
  } catch (e) {
    // If RPC not installed, just skip (site remains fully working)
    console.warn("View increment skipped (RPC missing or blocked):", e?.message || e);
  }
}

function render() {
  if (!photos.length) {
    counterEl.textContent = "0 / 0";
    caption.style.display = "none";
    thumbsEl.innerHTML = "";
    showLoading(false);
    return;
  }

  const p = photos[idx];
  const url = publicUrl(p.file_path);

  counterEl.textContent = `${idx + 1} / ${photos.length}`;

  // captions
  capTitle.textContent = p.title || "";
  capDesc.textContent = p.description || "";
  lbTitle.textContent = p.title || "";
  lbDesc.textContent = p.description || "";

  const hasCaption =
    (p.title && p.title.trim()) ||
    (p.description && p.description.trim());

  caption.style.display = hasCaption ? "" : "none";
  lbCaption.style.display = hasCaption ? "" : "none";

  // main image fade
  setImages(url);

  // keep lightbox in sync if open
  if (lightbox.classList.contains("show")) {
    lbImg.src = url;
  }

  // analytics
  incrementView(p).catch(() => {});

  // thumbnails
  thumbsEl.innerHTML = "";
  photos.forEach((tp, i) => {
    const btn = document.createElement("button");
    btn.className = "thumb-btn" + (i === idx ? " active" : "");
    btn.type = "button";
    btn.title = tp.title || `Photo ${i + 1}`;

    const timg = document.createElement("img");
    timg.className = "thumb-img";
    timg.src = publicUrl(tp.file_path);
    timg.alt = tp.title || `Photo ${i + 1}`;
    timg.loading = "lazy";

    btn.addEventListener("click", () => {
      idx = i;
      render();
    });

    btn.appendChild(timg);
    thumbsEl.appendChild(btn);
  });
}

function next() {
  if (!photos.length) return;
  idx = (idx + 1) % photos.length;
  render();
}
function prev() {
  if (!photos.length) return;
  idx = (idx - 1 + photos.length) % photos.length;
  render();
}

// Buttons
document.getElementById("nextBtn").addEventListener("click", next);
document.getElementById("prevBtn").addEventListener("click", prev);

// Fullscreen
function openLightbox() {
  if (!photos.length) return;
  lightbox.classList.add("show");
  lightbox.setAttribute("aria-hidden", "false");
  lbImg.src = publicUrl(photos[idx].file_path);
  document.body.style.overflow = "hidden";
}
function closeLightbox() {
  lightbox.classList.remove("show");
  lightbox.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

document.getElementById("fsBtn").addEventListener("click", openLightbox);
imgA.addEventListener("click", openLightbox);
imgB.addEventListener("click", openLightbox);

document.getElementById("lbClose").addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});

// Lightbox arrows
document.getElementById("lbNext").addEventListener("click", next);
document.getElementById("lbPrev").addEventListener("click", prev);

// Keyboard
document.addEventListener("keydown", (e) => {
  if (!photos.length) return;

  if (e.key === "ArrowRight") next();
  if (e.key === "ArrowLeft") prev();

  const isOpen = lightbox.classList.contains("show");
  if (isOpen && e.key === "Escape") closeLightbox();
});

// Swipe
function addSwipe(el) {
  let startX = 0;

  el.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
  }, { passive: true });

  el.addEventListener("touchend", (e) => {
    const endX = e.changedTouches[0].clientX;
    const dx = endX - startX;
    if (Math.abs(dx) > 40) dx < 0 ? next() : prev();
  }, { passive: true });
}
addSwipe(frame);
addSwipe(lightbox);

// Load photos
(async function load() {
  showLoading(true);

  const { data, error } = await sb
    .from("photos")
    .select("id,file_path,title,description,category,views,sort_order,is_active,created_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    showLoading(false);
    return;
  }

  allPhotos = data || [];
  buildFilters();
  applyCategoryFilter(); // also calls render()
})();
