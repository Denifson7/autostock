// ============================================================
//  AutoStock — app.js
//  Firebase Firestore — Inventario Automotriz (Solo Lectura)
// ============================================================

// ============================================================
//  🔥 FIREBASE CONFIGURATION
//  Reemplaza los valores de este objeto con los de tu proyecto
//  Firebase Console → Project Settings → Your Apps → Web App
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyANa39vlYiokrzT9eLllo1r7fLsdMfhmeE",
  authDomain: "autostock-inventario.firebaseapp.com",
  databaseURL: "https://autostock-inventario-default-rtdb.firebaseio.com",
  projectId: "autostock-inventario",
  storageBucket: "autostock-inventario.firebasestorage.app",
  messagingSenderId: "139644765699",
  appId: "1:139644765699:web:d690b1cc1f6cc10181f036"
};
// ============================================================
//  NOMBRES DE LAS COLECCIONES EN FIRESTORE
//  Deben coincidir exactamente con los nombres que usaste
//  al importar los JSON en Firebase.
// ============================================================
const COLLECTIONS = {
  aceites:   "ACEITES",
  filtros:   "FILTROS",
  pastillas: "PASTILLAS",
  varios:    "COSAS_VARIAS"   // Firebase no acepta espacios; usa guion bajo
};

// ============================================================
//  ICONOS Y COLORES POR CATEGORIA
// ============================================================
const CAT_META = {
  aceites:   { emoji: "🛢️",  label: "Aceite",   badge: "badge-aceites",   icon: "cat-aceites" },
  filtros:   { emoji: "🔩",  label: "Filtro",   badge: "badge-filtros",   icon: "cat-filtros" },
  pastillas: { emoji: "🔴",  label: "Pastilla", badge: "badge-pastillas", icon: "cat-pastillas" },
  varios:    { emoji: "📦",  label: "Varios",   badge: "badge-varios",    icon: "cat-varios" }
};

// ============================================================
//  CAMPOS IGNORADOS EN LA VISTA DETALLADA (ya se muestran en hero)
// ============================================================
const IGNORE_FIELDS = new Set(["PRECIO", "UBICACIÓN", "UBICACION", ""]);

// ============================================================
//  ESTADO GLOBAL
// ============================================================
let allItems   = [];          // Todos los productos cargados
let searchTerm = "";          // Término de búsqueda actual
let activeCategory = "all";   // Categoría activa

// ============================================================
//  DOM ELEMENTS
// ============================================================
const $ = id => document.getElementById(id);

const splashEl       = $("splash-screen");
const appEl          = $("app");
const searchInput    = $("search-input");
const clearBtn       = $("clear-search");
const resultsGrid    = $("results-grid");
const resultsCount   = $("results-count");
const stateIdle      = $("state-idle");
const stateLoading   = $("state-loading");
const stateEmpty     = $("state-empty");
const stateResults   = $("state-results");
const emptyMessage   = $("empty-message");
const connectionDot  = $("connection-status");
const modalOverlay   = $("detail-modal");
const modalSheet     = $("modal-sheet");
const modalClose     = $("modal-close");
const modalTitle     = $("modal-title");
const modalPrice     = $("modal-price");
const modalLocText   = $("modal-location-text");
const modalDetails   = $("modal-details");
const modalBadge     = $("modal-badge");

// Stats
const statAceites   = $("stat-aceites");
const statFiltros   = $("stat-filtros");
const statPastillas = $("stat-pastillas");
const statVarios    = $("stat-varios");

// ============================================================
//  INIT FIREBASE
// ============================================================
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ============================================================
//  LOAD DATA FROM FIRESTORE
// ============================================================
async function loadAllData() {
  try {
    const promises = Object.entries(COLLECTIONS).map(async ([catKey, colName]) => {
      const snapshot = await db.collection(colName).get();
      return snapshot.docs.map(doc => ({
        _id:      doc.id,
        _cat:     catKey,
        _raw:     doc.data(),
        ...doc.data()
      }));
    });

    const results = await Promise.allSettled(promises);
    let loaded = [];

    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        loaded = loaded.concat(r.value);
      } else {
        const catKey = Object.keys(COLLECTIONS)[i];
        console.warn(`Error cargando ${catKey}:`, r.reason);
      }
    });

    allItems = loaded;

    // Update stats bar
    statAceites.textContent   = allItems.filter(i => i._cat === "aceites").length;
    statFiltros.textContent   = allItems.filter(i => i._cat === "filtros").length;
    statPastillas.textContent = allItems.filter(i => i._cat === "pastillas").length;
    statVarios.textContent    = allItems.filter(i => i._cat === "varios").length;

    // Mark connection OK
    connectionDot.className = "status-dot status-ok";
    connectionDot.title = `${allItems.length} productos cargados`;
    connectionDot.querySelector(".status-pulse").style.background = "var(--accent-green)";

    // Show idle state
    showState("idle");

  } catch (err) {
    console.error("Error conectando a Firebase:", err);
    connectionDot.className = "status-dot status-error";
    connectionDot.title = "Error de conexión";
    emptyMessage.textContent = "No se pudo conectar a Firebase. Verifica las credenciales.";
    showState("empty");
  }
}

// ============================================================
//  SEARCH ENGINE  (client-side, runs on cached data)
// ============================================================
function search(term, category) {
  if (!term.trim() && category === "all") return null;  // show idle

  const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return allItems.filter(item => {
    // Category filter
    if (category !== "all" && item._cat !== category) return false;

    // Text filter (if any words)
    if (words.length === 0) return true;

    // Build searchable string from all field values
    const haystack = Object.values(item._raw)
      .filter(v => v && typeof v === "string")
      .join(" ")
      .toLowerCase();

    return words.every(w => haystack.includes(w));
  });
}

// ============================================================
//  RENDER RESULTS
// ============================================================
function renderResults(items) {
  if (!items) { showState("idle"); return; }
  if (items.length === 0) {
    showState("empty");
    const q = searchTerm.trim() || "";
    emptyMessage.textContent = q
      ? `No encontramos "${q}" en el inventario.`
      : "No hay productos en esta categoría.";
    return;
  }

  showState("results");
  resultsCount.textContent = `${items.length} resultado${items.length !== 1 ? "s" : ""} encontrado${items.length !== 1 ? "s" : ""}`;

  resultsGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();

  items.forEach(item => {
    const card = buildCard(item);
    fragment.appendChild(card);
  });

  resultsGrid.appendChild(fragment);
}

// ============================================================
//  BUILD PRODUCT CARD
// ============================================================
function buildCard(item) {
  const meta  = CAT_META[item._cat];
  const title = getTitle(item);
  const sub   = getSubtitle(item);
  const price = formatPrice(item.PRECIO || item.precio || "");
  const loc   = item["UBICACIÓN"] || item["UBICACION"] || item.ubicacion || "—";

  const card = document.createElement("div");
  card.className = "product-card";
  card.setAttribute("role", "listitem");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-label", `${title}, precio ${price}, ubicación ${loc}`);

  card.innerHTML = `
    <div class="card-icon ${meta.icon}" aria-hidden="true">${meta.emoji}</div>
    <div class="card-body">
      <div class="card-title">${escHtml(title)}</div>
      <div class="card-subtitle">${escHtml(sub)}</div>
      <div class="card-meta">
        <span class="card-category-badge ${meta.badge}">${meta.label}</span>
      </div>
    </div>
    <div class="card-right">
      <div class="card-price">${escHtml(price)}</div>
      <div class="card-location">
        <svg viewBox="0 0 12 12" fill="currentColor" width="10" height="10"><path d="M6 1a3 3 0 0 0-3 3c0 2.5 3 7 3 7s3-4.5 3-7a3 3 0 0 0-3-3zm0 4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
        ${escHtml(loc)}
      </div>
    </div>
    <svg class="card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg>
  `;

  card.addEventListener("click", () => openModal(item));
  card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") openModal(item); });

  return card;
}

// ============================================================
//  HELPER: derive display title & subtitle per category
// ============================================================
function getTitle(item) {
  switch (item._cat) {
    case "aceites":
      return [item.MARCA, item.CODIGO].filter(Boolean).join(" — ");
    case "filtros":
      return item.CARRO || "Filtro";
    case "pastillas":
      return [item.MARCA, item.CODIGO].filter(Boolean).join(" — ");
    case "varios":
      return item["DESCRIPCIÓN"] || item.DESCRIPCION || item.MARCA || "Producto";
    default:
      return item.MARCA || item["DESCRIPCIÓN"] || "Producto";
  }
}

function getSubtitle(item) {
  switch (item._cat) {
    case "aceites":
      return [item["PRESENTACIÓN"], item.CALIDAD, item.MOTOR].filter(Boolean).join(" · ");
    case "filtros":
      return ["Aceite:", item["FILTRO DE ACEITE"], "| Aire:", item["FILTRO DE AIRE"]].filter(Boolean).join(" ");
    case "pastillas":
      return [item.VEHICULO, item["APLICACIÓN"]].filter(Boolean).join(" — ");
    case "varios":
      return [item.MARCA, item.APLICACIÓN || item.APLICACION, item.MEDIDA].filter(Boolean).join(" · ");
    default:
      return "";
  }
}

// ============================================================
//  FORMAT PRICE
// ============================================================
function formatPrice(raw) {
  if (!raw || raw === "") return "—";
  const n = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
  if (isNaN(n)) return "—";
  return "$" + n.toFixed(2);
}

// ============================================================
//  MODAL DETAIL
// ============================================================
function openModal(item) {
  const meta  = CAT_META[item._cat];
  const title = getTitle(item);
  const price = formatPrice(item.PRECIO || item.precio || "");
  const loc   = item["UBICACIÓN"] || item["UBICACION"] || item.ubicacion || "—";

  // Badge
  modalBadge.textContent = meta.label;
  modalBadge.className = `modal-category-badge ${meta.badge}`;

  modalTitle.textContent    = title;
  modalPrice.textContent    = price;
  modalLocText.textContent  = loc;

  // Build detail rows from all raw fields
  modalDetails.innerHTML = "";
  const raw = item._raw;

  const LABELS = {
    "PRESENTACIÓN": "Presentación",
    "MARCA":        "Marca",
    "CODIGO":       "Código",
    "CALIDAD":      "Calidad",
    "MOTOR":        "Motor / Uso",
    "API":          "API",
    "VEHICULO":     "Vehículo",
    "APLICACIÓN":   "Aplicación",
    "APLICACION":   "Aplicación",
    "MATERIAL":     "Material",
    "STOCK":        "Stock",
    "MEDIDA":       "Medida",
    "DESCRIPCIÓN":  "Descripción",
    "DESCRIPCION":  "Descripción",
    "CARRO":        "Vehículo",
    "FILTRO DE ACEITE":       "Filtro de Aceite",
    "FILTRO DE AIRE":         "Filtro de Aire",
    "FILTRO DE COMBUSTIBLE ": "Filtro de Combustible",
    "":             null  // skip empty keys
  };

  const SKIP = new Set(["PRECIO","UBICACIÓN","UBICACION","ubicacion","precio"]);
  const fragment = document.createDocumentFragment();

  Object.entries(raw).forEach(([key, value]) => {
    const trimKey = key.trim();
    if (SKIP.has(trimKey) || trimKey === "" || !value || String(value).trim() === "") return;

    const row = document.createElement("div");
    row.className = "detail-row";
    const label = LABELS[key] || LABELS[trimKey] || trimKey;
    if (!label) return;

    const isHighlight = ["CODIGO","APLICACIÓN","APLICACION","VEHICULO","MATERIAL"].includes(trimKey);

    row.innerHTML = `
      <span class="detail-key">${escHtml(label)}</span>
      <span class="detail-value${isHighlight ? " highlight" : ""}">${escHtml(String(value).trim())}</span>
    `;
    fragment.appendChild(row);
  });

  modalDetails.appendChild(fragment);

  // Open modal with animation
  modalOverlay.classList.remove("hidden");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      modalOverlay.classList.add("open");
    });
  });
  document.body.style.overflow = "hidden";
  modalClose.focus();
}

function closeModal() {
  modalOverlay.classList.remove("open");
  setTimeout(() => {
    modalOverlay.classList.add("hidden");
    document.body.style.overflow = "";
  }, 350);
}

// ============================================================
//  SHOW/HIDE STATES
// ============================================================
function showState(state) {
  stateIdle.classList.add("hidden");
  stateLoading.classList.add("hidden");
  stateEmpty.classList.add("hidden");
  stateResults.classList.add("hidden");

  if (state === "idle")     stateIdle.classList.remove("hidden");
  if (state === "loading")  stateLoading.classList.remove("hidden");
  if (state === "empty")    stateEmpty.classList.remove("hidden");
  if (state === "results")  stateResults.classList.remove("hidden");
}

// ============================================================
//  EVENT LISTENERS
// ============================================================

// Search input — debounced
let searchDebounce;
searchInput.addEventListener("input", () => {
  const val = searchInput.value;
  searchTerm = val;
  clearBtn.classList.toggle("hidden", val === "");

  clearTimeout(searchDebounce);

  if (!val.trim() && activeCategory === "all") {
    showState("idle");
    return;
  }

  showState("loading");
  searchDebounce = setTimeout(() => {
    const results = search(searchTerm, activeCategory);
    renderResults(results);
  }, 280);
});

// Clear button
clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  searchTerm = "";
  clearBtn.classList.add("hidden");
  searchInput.focus();
  if (activeCategory === "all") {
    showState("idle");
  } else {
    const results = search("", activeCategory);
    renderResults(results);
  }
});

// Quick tags
document.querySelectorAll(".quick-tag").forEach(btn => {
  btn.addEventListener("click", () => {
    const q = btn.dataset.query;
    searchInput.value = q;
    searchTerm = q;
    clearBtn.classList.remove("hidden");
    showState("loading");
    setTimeout(() => {
      const results = search(q, activeCategory);
      renderResults(results);
    }, 200);
  });
});

// Category tabs
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    // Update active tab
    document.querySelectorAll(".tab-btn").forEach(b => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");

    activeCategory = btn.dataset.category;

    // Trigger search
    if (!searchTerm.trim() && activeCategory === "all") {
      showState("idle");
      return;
    }
    showState("loading");
    setTimeout(() => {
      const results = search(searchTerm, activeCategory);
      renderResults(results);
    }, 150);
  });
});

// Modal close
modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

// Prevent modal sheet from closing when swiping within it
let touchStartY = 0;
modalSheet.addEventListener("touchstart", e => { touchStartY = e.touches[0].clientY; }, { passive: true });

// ============================================================
//  UTILITY
// ============================================================
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================
//  BOOT SEQUENCE
// ============================================================
(function boot() {
  // Show loading splash for minimum 1.6s (matches animation), then reveal app
  const minSplash = new Promise(resolve => setTimeout(resolve, 1800));
  const dataReady = loadAllData();

  Promise.all([minSplash, dataReady]).then(() => {
    splashEl.style.opacity = "0";
    splashEl.style.transition = "opacity 0.4s ease";
    setTimeout(() => {
      splashEl.classList.add("hidden");
      appEl.classList.remove("hidden");
    }, 400);
  }).catch(err => {
    console.error("Boot error:", err);
    splashEl.classList.add("hidden");
    appEl.classList.remove("hidden");
  });
})();
