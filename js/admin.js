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
const uploadBtn = document.getElementById("uploadBtn");
const uploadMsg = document.getElementById("uploadMsg");

const photosList = document.getElementById("photosList");
const saveMsg = document.getElementById("saveMsg");

let photos = [];
let dragId = null;

let checkingView = false; // prevent overlapping view checks

// ------- Pretty confirm modal (requires modal HTML in admin.html) -------
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
  if (e.key === "Escape" && confirmModal && !confirmModal.classList.contains("hidden")) {
    closeConfirm();
  }
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

// -------------------
// Auth / View switching (non-blocking)
// -------------------
async function showCorrectView(where = "") {
  if (checkingView) return;
  checkingView = true;

  try {
    const { data } = await sb.auth.getSession();
    const session = data?.session;

    if (session?.user) {
      showAdminUI(`Logged in: ${session.user.email || ""}`);

      // load in background (don't block UI)
      loadPhotos().catch(() => {
        setMsg(saveMsg, "Logged in, but couldn't load photos. (Check RLS/Network)", true);
      });
    } else {
      showLoginUI();
    }
  } catch (err) {
    showLoginUI();
    setMsg(loginMsg, "Session check failed. Check browser privacy / console.", true);
  } finally {
    checkingView = false;
  }
}

async function login(e) {
  if (e?.preventDefault) e.preventDefault();

  setMsg(loginMsg, "");
  setMsg(saveMsg, "");

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
    setMsg(loginMsg, error.message, true);
    return;
  }

  showAdminUI(`Logged in: ${data.user.email || ""}`);

  // load in background (don't block UI)
  loadPhotos().catch(() => {
    setMsg(saveMsg, "Logged in, but couldn't load photos. (Check RLS/Network)", true);
  });
}

async function logout() {
  // instant UI swap
  showLoginUI();
  setMsg(loginMsg, "Logged out ✅");
  setMsg(saveMsg, "");
  setMsg(uploadMsg, "");
  if (photosList) photosList.innerHTML = "";
  photos = [];

  try {
    await sb.auth.signOut();
  } catch (e) {
    console.error("signOut error:", e);
  }

  checkingView = false;
  showCorrectView("manual after logout");
}

// -------------------
// Load Photos
// -------------------
async function loadPhotos() {
  setMsg(saveMsg, "");
  if (photosList) photosList.innerHTML = "";

  const { data, error } = await sb
    .from("photos")
    .select("id,file_path,title,description,sort_order,is_active,created_at")
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
  renderPhotos();
}

// -------------------
// Persist Sort Order (writes sort_order back to DB)
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
      <img class="thumb" src="${publicUrl(p.file_path)}" alt="photo" />

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
        </div>
        <div class="mini">Order: <strong>${index + 1}</strong></div>
      </div>

      <div class="photo-actions">
        <span class="drag-handle" title="Drag to reorder">↕ Drag</span>
        <button class="btn2 primary saveBtn" type="button">Save</button>
        <button class="btn2 danger deleteBtn" type="button">Delete</button>
      </div>
    `;

    const saveBtn = item.querySelector(".saveBtn");
    const deleteBtn = item.querySelector(".deleteBtn");
    const titleInput = item.querySelector(".titleInput");
    const descInput = item.querySelector(".descInput");

    // Save title/description
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      setMsg(saveMsg, "");

      const newTitle = titleInput.value.trim();
      const newDesc = descInput.value.trim();

      const { error } = await sb
        .from("photos")
        .update({ title: newTitle, description: newDesc })
        .eq("id", p.id);

      saveBtn.disabled = false;

      if (error) {
        console.error(error);
        setMsg(saveMsg, error.message || "Failed to save changes.", true);
        return;
      }

      p.title = newTitle;
      p.description = newDesc;
      setMsg(saveMsg, "Saved ✅");
      setTimeout(() => setMsg(saveMsg, ""), 1500);
    });

    // Delete (pretty modal)
    deleteBtn.addEventListener("click", () => {
      openConfirm("This will permanently delete the photo from the gallery.", async () => {
        setMsg(saveMsg, "");

        // 1) Delete file from storage
        const { error: storageErr } = await sb.storage.from("gallery").remove([p.file_path]);
        if (storageErr) {
          console.error(storageErr);
          setMsg(saveMsg, storageErr.message || "Failed to delete file from storage.", true);
          return;
        }

        // 2) Delete row from DB
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
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      dragId = null;
      document.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));
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
  const file = fileEl?.files?.[0];
  if (!file) {
    setMsg(uploadMsg, "Choose an image file first.", true);
    return;
  }

  uploadBtn.disabled = true;

  try {
    const sort_order = await getNextSortOrder();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const base = safeName(newTitleEl.value) || safeName(file.name);
    const filePath = `photos/${Date.now()}-${base}.${ext}`;

    const { error: upErr } = await sb.storage.from("gallery").upload(filePath, file, { upsert: false });
    if (upErr) {
      console.error(upErr);
      setMsg(uploadMsg, upErr.message || "Upload failed.", true);
      return;
    }

    const { error: insErr } = await sb.from("photos").insert({
      file_path: filePath,
      title: newTitleEl.value.trim(),
      description: newDescEl.value.trim(),
      sort_order,
      is_active: true
    });

    if (insErr) {
      console.error(insErr);
      setMsg(uploadMsg, insErr.message || "Database insert failed.", true);
      return;
    }

    fileEl.value = "";
    newTitleEl.value = "";
    newDescEl.value = "";

    setMsg(uploadMsg, "Uploaded ✅");
    await loadPhotos();
  } finally {
    uploadBtn.disabled = false;
    setTimeout(() => setMsg(uploadMsg, ""), 1800);
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

  refreshBtn?.addEventListener("click", () => loadPhotos());
  logoutBtn?.addEventListener("click", logout);
  uploadBtn?.addEventListener("click", uploadPhoto);

  showCorrectView("on load");
  sb.auth.onAuthStateChange(() => showCorrectView("auth change"));
}
