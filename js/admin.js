console.log("ADMIN.JS LOADED ✅");

const sb = window.sb;

// Views
const loginView = document.getElementById("loginView");
const adminView = document.getElementById("adminView");

// Login controls
const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const loginMsg = document.getElementById("loginMsg");

// Admin controls
const userEmail = document.getElementById("userEmail");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");

const fileEl = document.getElementById("file");
const newTitleEl = document.getElementById("newTitle");
const newDescEl = document.getElementById("newDesc");
const newCategoryEl = document.getElementById("newCategory");
const newFeaturedEl = document.getElementById("newFeatured");
const uploadBtn = document.getElementById("uploadBtn");
const uploadMsg = document.getElementById("uploadMsg");
const compressMsg = document.getElementById("compressMsg");

const photosList = document.getElementById("photosList");
const saveMsg = document.getElementById("saveMsg");

// Analytics UI
const statPhotos = document.getElementById("statPhotos");
const statViews = document.getElementById("statViews");
const topViewed = document.getElementById("topViewed");
const statFeatured = document.getElementById("statFeatured");

let photos = [];
let dragId = null;

let checkingView = false;

// -------------------
// Rate limiting (login)
// -------------------
const RL_KEY = "seaview_login_rl";
function getRL() {
  try { return JSON.parse(localStorage.getItem(RL_KEY) || "{}"); }
  catch { return {}; }
}
function setRL(obj) {
  localStorage.setItem(RL_KEY, JSON.stringify(obj || {}));
}
function getCooldownRemaining() {
  const rl = getRL();
  const until = rl.until || 0;
  return Math.max(0, until - Date.now());
}
function setCooldown(ms) {
  const rl = getRL();
  rl.until = Date.now() + ms;
  setRL(rl);
}
function recordFail() {
  const rl = getRL();
  rl.fails = (rl.fails || 0) + 1;

  // cooldown pattern: after 3 fails, apply cooldown increasing
  if (rl.fails >= 3) {
    const step = rl.fails - 2; // 1,2,3...
    const seconds = Math.min(300, 20 * step); // 20s,40s,60s... max 5min
    setCooldown(seconds * 1000);
  }
  setRL(rl);
}
function recordSuccess() {
  setRL({ fails: 0, until: 0 });
}

// -------------------
// Auto-scroll while dragging (desktop)
// -------------------
let autoScrollInterval = null;
let lastDragY = null;

function onDragOverAutoScroll(e) {
  lastDragY = e.clientY;
  if (autoScrollInterval) return;

  autoScrollInterval = setInterval(() => {
    if (lastDragY == null) return;

    const scrollZone = 90;
    const maxSpeed = 16;
    const vh = window.innerHeight;

    const distTop = scrollZone - lastDragY;
    const distBottom = lastDragY - (vh - scrollZone);

    if (distBottom > 0) {
      const speed = Math.min(maxSpeed, Math.ceil((distBottom / scrollZone) * maxSpeed));
      window.scrollBy(0, speed);
    }
    if (distTop > 0) {
      const speed = Math.min(maxSpeed, Math.ceil((distTop / scrollZone) * maxSpeed));
      window.scrollBy(0, -speed);
    }
  }, 16);
}

function stopAutoScroll() {
  if (autoScrollInterval) {
    clearInterval(autoScrollInterval);
    autoScrollInterval = null;
  }
  lastDragY = null;
}

// -------------------
// Confirm modal
// -------------------
const confirmModal = document.getElementById("confirmModal");
const confirmText = document.getElementById("confirmText");
const confirmCancel = document.getElementById("confirmCancel");
const confirmDelete = document.getElementById("confirmDelete");

let confirmAction = null;

function openConfirm(message, onConfirm) {
  confirmAction = onConfirm;
  if (confirmText) confirmText.textContent = message || "Are you sure?";
  confirmModal?.classList.remove("hidden");
  confirmModal?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  confirmDelete?.focus();
}

function closeConfirm() {
  confirmModal?.classList.add("hidden");
  confirmModal?.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  confirmAction = null;
}

confirmCancel?.addEventListener("click", closeConfirm);
confirmModal?.addEventListener("click", (e) => {
  if (e.target?.dataset?.close === "true") closeConfirm();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && confirmModal && !confirmModal.classList.contains("hidden")) closeConfirm();
});
confirmDelete?.addEventListener("click", async () => {
  if (!confirmAction) return;
  const action = confirmAction;
  closeConfirm();
  await action();
});

// -------------------
// Helpers
// -------------------
function setMsg(el, text, isError = false) {
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isError ? "#b91c1c" : "";
}

function showLoginUI() {
  adminView?.classList.add("hidden");
  loginView?.classList.remove("hidden");
}

function showAdminUI(emailText = "") {
  loginView?.classList.add("hidden");
  adminView?.classList.remove("hidden");
  if (userEmail) userEmail.textContent = emailText;
}

function publicUrl(file_path) {
  const { data } = sb.storage.from("gallery").getPublicUrl(file_path);
  return data.publicUrl;
}

function safeName(name) {
  return (name || "photo")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeCategory(cat) {
  const c = (cat || "").trim();
  if (!c) return null;
  // Optional: title-case-ish
  return c.length > 1 ? c[0].toUpperCase() + c.slice(1) : c.toUpperCase();
}

// -------------------
// Auth / View switching
// -------------------
async function showCorrectView() {
  if (checkingView) return;
  checkingView = true;

  try {
    const { data } = await sb.auth.getSession();
    const session = data?.session;

    if (session?.user) {
      showAdminUI(`Logged in: ${session.user.email || ""}`);
      loadPhotos().catch(() => setMsg(saveMsg, "Logged in, but couldn't load photos.", true));
    } else {
      showLoginUI();
    }
  } catch {
    showLoginUI();
    setMsg(loginMsg, "Session check failed. Check browser privacy / console.", true);
  } finally {
    checkingView = false;
  }
}

// -------------------
// Login / Logout with rate limiting
// -------------------
async function login(e) {
  if (e?.preventDefault) e.preventDefault();

  setMsg(loginMsg, "");
  setMsg(saveMsg, "");

  const remaining = getCooldownRemaining();
  if (remaining > 0) {
    setMsg(loginMsg, `Too many attempts. Try again in ${Math.ceil(remaining / 1000)}s.`, true);
    return;
  }

  const email = emailEl?.value?.trim();
  const password = passEl?.value;

  if (!email || !password) {
    setMsg(loginMsg, "Please enter email and password.", true);
    return;
  }

  loginBtn.disabled = true;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  loginBtn.disabled = false;

  if (error) {
    recordFail();
    const rem = getCooldownRemaining();
    if (rem > 0) {
      setMsg(loginMsg, `Login failed. Cooldown: ${Math.ceil(rem / 1000)}s.`, true);
    } else {
      setMsg(loginMsg, error.message, true);
    }
    return;
  }

  recordSuccess();
  showAdminUI(`Logged in: ${data.user.email || ""}`);
  loadPhotos().catch(() => setMsg(saveMsg, "Logged in, but couldn't load photos.", true));
}

async function logout() {
  showLoginUI();
  setMsg(loginMsg, "Logged out ✅");
  setMsg(saveMsg, "");
  setMsg(uploadMsg, "");
  setMsg(compressMsg, "");
  if (photosList) photosList.innerHTML = "";
  photos = [];

  try {
    await sb.auth.signOut();
  } catch (e) {
    console.error("signOut error:", e);
  }

  checkingView = false;
  showCorrectView();
}

// -------------------
// Analytics render
// -------------------
function renderAnalytics() {
  if (!statPhotos || !statViews || !topViewed || !statFeatured) return;

  const totalPhotos = photos.length;
  const totalViews = photos.reduce((sum, p) => sum + (p.views ?? 0), 0);
  const featuredCount = photos.filter(p => !!p.is_featured).length;

  statPhotos.textContent = String(totalPhotos);
  statViews.textContent = String(totalViews);
  statFeatured.textContent = `${featuredCount} featured`;

  const top = photos
    .slice()
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 5);

  topViewed.innerHTML = "";
  if (!top.length) {
    topViewed.innerHTML = `<li>No photos yet.</li>`;
    return;
  }

  top.forEach(p => {
    const li = document.createElement("li");
    li.textContent = `${p.title || "Untitled"} — ${p.views ?? 0} views`;
    topViewed.appendChild(li);
  });
}

// -------------------
// Load Photos
// -------------------
async function loadPhotos() {
  setMsg(saveMsg, "");
  if (photosList) photosList.innerHTML = "";

  const { data, error } = await sb
    .from("photos")
    .select("id,file_path,title,description,category,is_featured,views,sort_order,is_active,created_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    setMsg(saveMsg, error.message || "Failed to load photos.", true);
    if (photosList) photosList.innerHTML = `<div class="mini">Could not load photos.</div>`;
    return;
  }

  photos = data || [];
  renderAnalytics();
  renderPhotos();
}

// -------------------
// Persist Sort Order
// -------------------
async function persistSortOrder() {
  setMsg(saveMsg, "Saving order…");

  const updates = photos.map((p, i) => ({ id: p.id, sort_order: i + 1 }));

  const results = await Promise.all(
    updates.map(u => sb.from("photos").update({ sort_order: u.sort_order }).eq("id", u.id))
  );

  const failed = results.find(r => r.error);
  if (failed?.error) {
    console.error(failed.error);
    setMsg(saveMsg, failed.error.message || "Failed to save order.", true);
    return false;
  }

  setMsg(saveMsg, "Order saved ✅");
  setTimeout(() => setMsg(saveMsg, ""), 1200);
  return true;
}

// -------------------
// Render Photos
// -------------------
function renderPhotos() {
  if (!photosList) return;
  photosList.innerHTML = "";

  if (!photos.length) {
    photosList.innerHTML = `<div class="mini">No photos yet.</div>`;
    return;
  }

  photos.forEach((p, index) => {
    const item = document.createElement("div");
    item.className = "photo-item";
    item.draggable = true;
    item.dataset.id = p.id;

    item.innerHTML = `
      <img class="thumb" src="${publicUrl(p.file_path)}" alt="photo" loading="lazy" />

      <div>
        <div class="photo-fields">
          <label class="field">
            <span>Title</span>
            <input type="text" class="titleInput" value="${escapeHtml(p.title)}" />
          </label>
          <label class="field">
            <span>Description</span>
            <input type="text" class="descInput" value="${escapeHtml(p.description)}" />
          </label>
          <label class="field">
            <span>Category</span>
            <input type="text" class="catInput" value="${escapeHtml(p.category)}" placeholder="e.g. Rooms" />
          </label>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">
          <div class="checkrow" style="flex:1; min-width:220px;">
            <input type="checkbox" class="featInput" ${p.is_featured ? "checked" : ""} />
            <span>Featured (Show on Home)</span>
          </div>
          <div class="mini" style="margin-top:0;">Views: <strong>${p.views ?? 0}</strong> • Order: <strong>${index + 1}</strong></div>
        </div>
      </div>

      <div class="photo-actions">
        <span class="drag-handle" title="Drag to reorder">↕ Drag</span>

        <div class="mobile-order">
          <button class="btn2 upBtn" type="button">↑</button>
          <button class="btn2 downBtn" type="button">↓</button>
        </div>

        <button class="btn2 primary saveBtn" type="button">Save</button>
        <button class="btn2 danger deleteBtn" type="button">Delete</button>
      </div>
    `;

    const saveBtn = item.querySelector(".saveBtn");
    const deleteBtn = item.querySelector(".deleteBtn");
    const upBtn = item.querySelector(".upBtn");
    const downBtn = item.querySelector(".downBtn");
    const titleInput = item.querySelector(".titleInput");
    const descInput = item.querySelector(".descInput");
    const catInput = item.querySelector(".catInput");
    const featInput = item.querySelector(".featInput");

    if (upBtn) upBtn.disabled = index === 0;
    if (downBtn) downBtn.disabled = index === photos.length - 1;

    upBtn?.addEventListener("click", async () => {
      if (index === 0) return;
      [photos[index - 1], photos[index]] = [photos[index], photos[index - 1]];
      const ok = await persistSortOrder();
      if (ok) await loadPhotos();
      else renderPhotos();
    });

    downBtn?.addEventListener("click", async () => {
      if (index === photos.length - 1) return;
      [photos[index + 1], photos[index]] = [photos[index], photos[index + 1]];
      const ok = await persistSortOrder();
      if (ok) await loadPhotos();
      else renderPhotos();
    });

    // Save
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      setMsg(saveMsg, "");

      const newTitle = titleInput.value.trim();
      const newDesc = descInput.value.trim();
      const newCat = normalizeCategory(catInput.value);
      const newFeat = !!featInput.checked;

      const { error } = await sb.from("photos")
        .update({ title: newTitle, description: newDesc, category: newCat, is_featured: newFeat })
        .eq("id", p.id);

      saveBtn.disabled = false;

      if (error) {
        console.error(error);
        setMsg(saveMsg, error.message || "Failed to save changes.", true);
        return;
      }

      setMsg(saveMsg, "Saved ✅");
      setTimeout(() => setMsg(saveMsg, ""), 1500);
      await loadPhotos();
    });

    // Delete (modal)
    deleteBtn.addEventListener("click", () => {
      openConfirm("This will permanently delete the photo from the gallery.", async () => {
        setMsg(saveMsg, "");

        const { error: storageErr } = await sb.storage.from("gallery").remove([p.file_path]);
        if (storageErr) {
          console.error(storageErr);
          setMsg(saveMsg, storageErr.message || "Failed to delete file from storage.", true);
          return;
        }

        const { error: dbErr } = await sb.from("photos").delete().eq("id", p.id);
        if (dbErr) {
          console.error(dbErr);
          setMsg(saveMsg, dbErr.message || "Failed to delete from database.", true);
          return;
        }

        setMsg(saveMsg, "Deleted ✅");
        await loadPhotos();
      });
    });

    // Drag reorder
    item.addEventListener("dragstart", (ev) => {
      dragId = p.id;
      item.classList.add("dragging");
      ev.dataTransfer.effectAllowed = "move";
      document.addEventListener("dragover", onDragOverAutoScroll);
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      dragId = null;
      document.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));
      stopAutoScroll();
      document.removeEventListener("dragover", onDragOverAutoScroll);
    });

    item.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      item.classList.add("drop-target");
      ev.dataTransfer.dropEffect = "move";
    });

    item.addEventListener("dragleave", () => item.classList.remove("drop-target"));

    item.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      item.classList.remove("drop-target");
      if (!dragId) return;

      const targetId = p.id;
      if (targetId === dragId) return;

      const fromIndex = photos.findIndex(x => x.id === dragId);
      const toIndex = photos.findIndex(x => x.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return;

      const moved = photos.splice(fromIndex, 1)[0];
      photos.splice(toIndex, 0, moved);

      const ok = await persistSortOrder();
      if (ok) await loadPhotos();
      else renderPhotos();
    });

    photosList.appendChild(item);
  });
}

// -------------------
// Upload helpers: validate + compress
// -------------------
function validateFile(file) {
  if (!file) return "Choose an image file first.";
  if (!file.type.startsWith("image/")) return "Only image files are allowed.";
  const maxMB = 8;
  if (file.size > maxMB * 1024 * 1024) return `Image too large. Max ${maxMB}MB.`;
  return null;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function compressImageFile(file, opts = {}) {
  const maxW = opts.maxWidth ?? 1600;
  const quality = opts.quality ?? 0.82; // JPEG quality
  const img = await loadImageFromFile(file);

  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const scale = Math.min(1, maxW / w);
  const nw = Math.round(w * scale);
  const nh = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = nw;
  canvas.height = nh;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, nw, nh);

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );

  // cleanup object URL
  try { URL.revokeObjectURL(img.src); } catch {}

  return new File([blob], file.name.replace(/\.(png|webp|jpeg|jpg)$/i, ".jpg"), { type: "image/jpeg" });
}

// -------------------
// Upload
// -------------------
async function getNextSortOrder() {
  const { data, error } = await sb
    .from("photos")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);

  if (error) return 1;
  return (data?.[0]?.sort_order ?? 0) + 1;
}

async function uploadPhoto() {
  setMsg(uploadMsg, "");
  setMsg(compressMsg, "");

  const original = fileEl?.files?.[0];
  const err = validateFile(original);
  if (err) {
    setMsg(uploadMsg, err, true);
    return;
  }

  uploadBtn.disabled = true;

  try {
    // Compress
    setMsg(compressMsg, "Compressing image…");
    const compressed = await compressImageFile(original, { maxWidth: 1600, quality: 0.82 });

    const beforeKB = Math.round(original.size / 1024);
    const afterKB = Math.round(compressed.size / 1024);
    setMsg(compressMsg, `Compressed: ${beforeKB}KB → ${afterKB}KB ✅`);

    const sort_order = await getNextSortOrder();
    const ext = "jpg";
    const base = safeName(newTitleEl.value) || safeName(original.name);
    const filePath = `photos/${Date.now()}-${base}.${ext}`;

    const { error: upErr } = await sb.storage.from("gallery").upload(filePath, compressed, { upsert: false });
    if (upErr) {
      console.error(upErr);
      setMsg(uploadMsg, upErr.message || "Upload failed.", true);
      return;
    }

    const { error: insErr } = await sb.from("photos").insert({
      file_path: filePath,
      title: newTitleEl.value.trim(),
      description: newDescEl.value.trim(),
      category: normalizeCategory(newCategoryEl.value),
      is_featured: !!newFeaturedEl.checked,
      sort_order,
      is_active: true,
      views: 0
    });

    if (insErr) {
      console.error(insErr);
      setMsg(uploadMsg, insErr.message || "Database insert failed.", true);
      return;
    }

    fileEl.value = "";
    newTitleEl.value = "";
    newDescEl.value = "";
    newCategoryEl.value = "";
    newFeaturedEl.checked = false;

    setMsg(uploadMsg, "Uploaded ✅");
    await loadPhotos();
  } finally {
    uploadBtn.disabled = false;
    setTimeout(() => {
      setMsg(uploadMsg, "");
      setMsg(compressMsg, "");
    }, 2200);
  }
}

// -------------------
// Init
// -------------------
if (!sb) {
  console.error("window.sb missing (supabaseClient.js not loaded?)");
  setMsg(loginMsg, "Supabase client not loaded. Check supabaseClient.js path.", true);
} else {
  loginBtn?.addEventListener("click", login);
  passEl?.addEventListener("keydown", (e) => { if (e.key === "Enter") login(e); });

  refreshBtn?.addEventListener("click", loadPhotos);
  logoutBtn?.addEventListener("click", logout);
  uploadBtn?.addEventListener("click", uploadPhoto);

  showCorrectView();
  sb.auth.onAuthStateChange(() => showCorrectView());
}
