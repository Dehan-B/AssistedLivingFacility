const sb = window.sb;

let photos = [];
let idx = 0;

const frame = document.getElementById("frame");
const imgEl = document.getElementById("slideImg");
const thumbsEl = document.getElementById("thumbs");
const counterEl = document.getElementById("counter");

const caption = document.getElementById("caption");
const capTitle = document.getElementById("capTitle");
const capDesc  = document.getElementById("capDesc");

const lightbox = document.getElementById("lightbox");
const lbImg = document.getElementById("lbImg");
const lbCaption = document.getElementById("lbCaption");
const lbTitle  = document.getElementById("lbTitle");
const lbDesc   = document.getElementById("lbDesc");

function publicUrl(file_path){
  const { data } = sb.storage.from("gallery").getPublicUrl(file_path);
  return data.publicUrl;
}

function render() {
  if (!photos.length) return;

  const p = photos[idx];
  const url = publicUrl(p.file_path);

  // counter
  counterEl.textContent = `${idx + 1} / ${photos.length}`;

  // main image (smooth fade/scale)
  imgEl.src = url;
  imgEl.classList.remove("show");
  requestAnimationFrame(() => imgEl.classList.add("show"));

  // captions
  capTitle.textContent = p.title || "";
  capDesc.textContent  = p.description || "";
  lbTitle.textContent  = p.title || "";
  lbDesc.textContent   = p.description || "";

  const hasCaption =
    (p.title && p.title.trim()) ||
    (p.description && p.description.trim());

  caption.style.display = hasCaption ? "" : "none";
  lbCaption.style.display = hasCaption ? "" : "none";

  // keep lightbox in sync if open
  if (lightbox.classList.contains("show")) {
    lbImg.src = url;
  }

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

    btn.addEventListener("click", () => {
      idx = i;
      render();
    });

    btn.appendChild(timg);
    thumbsEl.appendChild(btn);
  });
}

function next() { idx = (idx + 1) % photos.length; render(); }
function prev() { idx = (idx - 1 + photos.length) % photos.length; render(); }

// Buttons on the photo
document.getElementById("nextBtn").addEventListener("click", next);
document.getElementById("prevBtn").addEventListener("click", prev);

// Fullscreen open/close
function openLightbox(){
  if (!photos.length) return;
  lightbox.classList.add("show");
  lightbox.setAttribute("aria-hidden", "false");
  lbImg.src = publicUrl(photos[idx].file_path);
  document.body.style.overflow = "hidden";
}
function closeLightbox(){
  lightbox.classList.remove("show");
  lightbox.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

document.getElementById("fsBtn").addEventListener("click", openLightbox);
imgEl.addEventListener("click", openLightbox);

document.getElementById("lbClose").addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});

// Lightbox arrows
document.getElementById("lbNext").addEventListener("click", next);
document.getElementById("lbPrev").addEventListener("click", prev);

// Keyboard controls
document.addEventListener("keydown", (e) => {
  if (!photos.length) return;

  if (e.key === "ArrowRight") next();
  if (e.key === "ArrowLeft") prev();

  const isOpen = lightbox.classList.contains("show");
  if (isOpen && e.key === "Escape") closeLightbox();
});

// Swipe (frame + lightbox)
function addSwipe(el){
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

// Load photos from DB
(async function load() {
  const { data, error } = await sb
    .from("photos")
    .select("id,file_path,title,description,sort_order,is_active,created_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    imgEl.alt = "Failed to load photos";
    return;
  }

  photos = data || [];
  idx = 0;

  if (!photos.length) {
    imgEl.alt = "No photos yet";
    counterEl.textContent = "0 / 0";
    caption.style.display = "none";
    return;
  }

  render();
})();
