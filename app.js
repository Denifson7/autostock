// ============================================================
//  AutoStock — app.js  (Light Mode · Normalized)
//  Firebase Firestore — Inventario Automotriz (Solo Lectura)
// ============================================================

// ============================================================
//  🔥 FIREBASE CONFIGURATION — Reemplaza con tus credenciales
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
// ============================================================
const COLLECTIONS = {
  aceites:   "ACEITES",
  filtros:   "FILTROS",
  pastillas: "PASTILLAS",
  varios:    "COSAS_VARIAS"
};

// ============================================================
//  METADATOS VISUALES POR CATEGORÍA
// ============================================================
const CAT_META = {
  aceites:   { emoji: "🛢️",  pillLabel: "Aceite",   pillClass: "pill-aceite",   iconClass: "icon-aceite"   },
  filtros:   { emoji: "🔩",  pillLabel: "Filtro",   pillClass: "pill-filtro",   iconClass: "icon-filtro"   },
  pastillas: { emoji: "🔴",  pillLabel: "Pastilla", pillClass: "pill-pastilla", iconClass: "icon-pastilla" },
  varios:    { emoji: "📦",  pillLabel: "Producto", pillClass: "pill-varios",   iconClass: "icon-varios"   }
};

// ============================================================
//  CAMPOS SIEMPRE EXCLUIDOS DEL MODAL DE DETALLES
// ============================================================
const SKIP_IN_MODAL = new Set([
  "PRECIO", "UBICACIÓN", "UBICACION", "ubicacion", "precio", ""
]);

// ============================================================
//  ESTADO GLOBAL
// ============================================================
let allItems      = [];
let searchTerm    = "";
let activeCategory = "all";

// ============================================================
//  DOM ELEMENTS
// ============================================================
const $ = id => document.getElementById(id);

const splashEl      = $("splash-screen");
const appEl         = $("app");
const searchInput   = $("search-input");
const clearBtn      = $("clear-search");
const resultsGrid   = $("results-grid");
const resultsCount  = $("results-count");
const stateIdle     = $("state-idle");
const stateLoading  = $("state-loading");
const stateEmpty    = $("state-empty");
const stateResults  = $("state-results");
const emptyMessage  = $("empty-message");
const connectionDot = $("connection-status");
const modalOverlay  = $("detail-modal");
const modalClose    = $("modal-close");
const modalTitle    = $("modal-title");
const modalPrice    = $("modal-price");
const modalLocText  = $("modal-location-text");
const modalLocChip  = $("modal-location");
const modalDetails  = $("modal-details");
const modalBadge    = $("modal-badge");

const statAceites   = $("stat-aceites");
const statFiltros   = $("stat-filtros");
const statPastillas = $("stat-pastillas");
const statVarios    = $("stat-varios");

// ============================================================
//  FIREBASE INIT
// ============================================================
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ============================================================
//  LOAD DATA FROM FIRESTORE
// ============================================================
async function loadAllData() {
  const promises = Object.entries(COLLECTIONS).map(([catKey, colName]) =>
    db.collection(colName).get()
      .then(snap => snap.docs.map(doc => ({
        _id:  doc.id,
        _cat: catKey,
        _raw: doc.data(),
        ...doc.data()
      })))
      .catch(err => { console.warn(`Error en ${catKey}:`, err); return []; })
  );

  const arrays = await Promise.all(promises);
  allItems = arrays.flat();

  // Update stats bar
  statAceites.textContent   = allItems.filter(i => i._cat === "aceites").length;
  statFiltros.textContent   = allItems.filter(i => i._cat === "filtros").length;
  statPastillas.textContent = allItems.filter(i => i._cat === "pastillas").length;
  statVarios.textContent    = allItems.filter(i => i._cat === "varios").length;

  const total = allItems.length;
  connectionDot.className  = `status-dot ${total > 0 ? "status-ok" : "status-error"}`;
  connectionDot.title      = total > 0 ? `${total} productos cargados` : "Sin datos";

  showState("idle");
}

// ============================================================
//  ★  NORMALIZACIÓN DE DATOS — corazón del sistema
//     Transforma cualquier ítem crudo en un objeto estandarizado
// ============================================================
function normalizeItem(item) {
  const raw = item._raw;

  // Helper para leer un campo, limpiando espacios
  const f = (...keys) => {
    for (const k of keys) {
      const v = raw[k];
      if (v && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };

  let title = "";
  let subs  = [];       // Máx. 3 subtítulos
  let fields = {};      // Campos extra para el modal

  switch (item._cat) {

    // ── ACEITES ───────────────────────────────────────────
    case "aceites":
      title = f("MARCA");
      subs  = [
        f("PRESENTACIÓN") ? "Pres: " + f("PRESENTACIÓN") : "",
        f("CODIGO")       ? "Cód: "  + f("CODIGO")       : "",
        f("CALIDAD")      ? "Cal: "  + f("CALIDAD")      : "",
      ].filter(Boolean);
      fields = {
        "Motor / Uso": f("MOTOR"),
        "API":         f("API"),
        "Presentación": f("PRESENTACIÓN"),
        "Código":      f("CODIGO"),
        "Calidad":     f("CALIDAD"),
      };
      break;

    // ── FILTROS ───────────────────────────────────────────
    case "filtros":
      title = f("FILTRO DE ACEITE", "CARRO");
      subs  = [
        f("CARRO")            ? "Carro: " + f("CARRO")            : "",
        f("FILTRO DE AIRE")   ? "Aire: "  + f("FILTRO DE AIRE")   : "",
      ].filter(Boolean);
      fields = {
        "Vehículo":             f("CARRO"),
        "Filtro de Aceite":     f("FILTRO DE ACEITE"),
        "Serie":                f(""),           // campo "" de filtros
        "Filtro de Aire":       f("FILTRO DE AIRE"),
        "Filtro de Combustible": f("FILTRO DE COMBUSTIBLE ", "FILTRO DE COMBUSTIBLE"),
      };
      // El campo "" de filtros contiene la serie
      if (raw[""] && String(raw[""]).trim() !== "") {
        fields["Serie"] = String(raw[""]).trim();
      } else {
        delete fields["Serie"];
      }
      break;

    // ── PASTILLAS ─────────────────────────────────────────
    case "pastillas":
      title = f("MARCA");
      subs  = [
        f("CODIGO")   ? "Cód: "  + f("CODIGO")   : "",
        f("VEHICULO") ? "Veh: "  + f("VEHICULO")  : "",
        f("APLICACIÓN") ? f("APLICACIÓN")          : "",
      ].filter(Boolean);
      fields = {
        "Código":      f("CODIGO"),
        "Vehículo":    f("VEHICULO"),
        "Aplicación":  f("APLICACIÓN"),
        "Material":    f("MATERIAL"),
        "Stock":       f("STOCK"),
      };
      break;

    // ── VARIOS (COSAS_VARIAS) ─────────────────────────────
    case "varios":
      const descVar   = f("DESCRIPCIÓN", "DESCRIPCION");
      const marcaVar  = f("MARCA");
      title = marcaVar || descVar || "Producto";
      subs  = [
        descVar              ? "Desc: " + descVar                       : "",
        f("APLICACIÓN","APLICACION") ? "App: " + f("APLICACIÓN","APLICACION") : "",
        f("MEDIDA")          ? "Med: "  + f("MEDIDA")                   : "",
      ].filter(Boolean);
      fields = {
        "Descripción": descVar,
        "Aplicación":  f("APLICACIÓN", "APLICACION"),
        "Medida":      f("MEDIDA"),
        "Marca":       marcaVar,
      };
      break;
  }

  // Precio y Ubicación
  const price = f("PRECIO", "precio");
  const loc   = f("UBICACIÓN", "UBICACION", "ubicacion");

  return { title, subs, price, loc, fields };
}

// ============================================================
//  FORMAT PRICE — devuelve "$XX.XX" o "" si vacío
// ============================================================
function formatPrice(raw) {
  if (!raw) return "";
  const n = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? "" : "$" + n.toFixed(2);
}

// ============================================================
//  SEARCH ENGINE (client-side)
// ============================================================
function search(term, category) {
  if (!term.trim() && category === "all") return null;  // idle

  const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return allItems.filter(item => {
    if (category !== "all" && item._cat !== category) return false;
    if (words.length === 0) return true;

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
  if (!items)          { showState("idle"); return; }
  if (items.length === 0) {
    emptyMessage.textContent = searchTerm.trim()
      ? `No encontramos "${searchTerm.trim()}" en el inventario.`
      : "No hay productos en esta categoría.";
    showState("empty");
    return;
  }

  showState("results");
  const count = items.length;
  resultsCount.textContent = `${count} resultado${count !== 1 ? "s" : ""}`;

  resultsGrid.innerHTML = "";
  const frag = document.createDocumentFragment();
  items.forEach(item => frag.appendChild(buildCard(item)));
  resultsGrid.appendChild(frag);
}

// ============================================================
//  BUILD CARD
// ============================================================
function buildCard(item) {
  const meta       = CAT_META[item._cat];
  const normalized = normalizeItem(item);
  const priceStr   = formatPrice(normalized.price);
  const locStr     = normalized.loc;

  const card = document.createElement("div");
  card.className = "product-card";
  card.setAttribute("role", "listitem");
  card.setAttribute("tabindex", "0");

  // Subtítulos — máx 2 líneas para no sobrecargar
  const subsHtml = normalized.subs.slice(0, 2)
    .map(s => `<div class="card-sub">${esc(s)}</div>`)
    .join("");

  // Precio
  const priceHtml = priceStr
    ? `<span class="card-price">${esc(priceStr)}</span>`
    : `<span class="card-price empty-val">Consultar</span>`;

  // Ubicación
  const locHtml = locStr
    ? `<span class="card-location">
         <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
           <path d="M8 1a5 5 0 0 0-5 5c0 3.5 5 9 5 9s5-5.5 5-9a5 5 0 0 0-5-5zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
         </svg>
         ${esc(locStr)}
       </span>`
    : `<span class="card-location empty-val">Consultar</span>`;

  card.innerHTML = `
    <div class="card-icon ${meta.iconClass}" aria-hidden="true">${meta.emoji}</div>
    <div class="card-body">
      <div class="card-title">${esc(normalized.title)}</div>
      <div class="card-subs">${subsHtml}</div>
    </div>
    <span class="card-pill ${meta.pillClass}">${meta.pillLabel}</span>
    <div class="card-footer">
      ${priceHtml}
      ${locHtml}
    </div>
  `;

  const open = () => openModal(item, normalized, meta);
  card.addEventListener("click", open);
  card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") open(); });
  return card;
}

// ============================================================
//  OPEN MODAL
// ============================================================
function openModal(item, normalized, meta) {
  // Badge / pill
  modalBadge.textContent = meta.pillLabel;
  modalBadge.className   = `modal-pill ${meta.pillClass}`;

  // Title
  modalTitle.textContent = normalized.title;

  // Price
  const priceStr = formatPrice(normalized.price);
  if (priceStr) {
    modalPrice.textContent  = priceStr;
    modalPrice.className    = "modal-price";
  } else {
    modalPrice.textContent  = "Consultar";
    modalPrice.className    = "modal-price empty-val";
  }

  // Location chip
  if (normalized.loc) {
    modalLocText.textContent  = normalized.loc;
    modalLocChip.className    = "modal-location-chip";
  } else {
    modalLocText.textContent  = "Consultar";
    modalLocChip.className    = "modal-location-chip empty-val";
  }

  // Detail rows — uses the normalized `fields` map
  modalDetails.innerHTML = "";
  const list = document.createElement("div");
  list.className = "detail-list";

  let hasRows = false;
  for (const [label, value] of Object.entries(normalized.fields)) {
    if (!value || String(value).trim() === "") continue;

    const row = document.createElement("div");
    row.className = "detail-row";
    const isHighlight = ["Código", "Aplicación", "Material", "Vehículo"].includes(label);
    row.innerHTML = `
      <span class="detail-key">${esc(label)}</span>
      <span class="detail-value${isHighlight ? " highlight" : ""}">${esc(String(value).trim())}</span>
    `;
    list.appendChild(row);
    hasRows = true;
  }

  if (hasRows) modalDetails.appendChild(list);

  // Show modal
  modalOverlay.classList.remove("hidden");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    modalOverlay.classList.add("open");
  }));
  document.body.style.overflow = "hidden";
  modalClose.focus();
}

// ============================================================
//  CLOSE MODAL
// ============================================================
function closeModal() {
  modalOverlay.classList.remove("open");
  setTimeout(() => {
    modalOverlay.classList.add("hidden");
    document.body.style.overflow = "";
  }, 360);
}

// ============================================================
//  SHOW STATE
// ============================================================
function showState(state) {
  stateIdle.classList.add("hidden");
  stateLoading.classList.add("hidden");
  stateEmpty.classList.add("hidden");
  stateResults.classList.add("hidden");
  $(`state-${state}`).classList.remove("hidden");
}

// ============================================================
//  EVENTS
// ============================================================
let debounce;
searchInput.addEventListener("input", () => {
  const v = searchInput.value;
  searchTerm = v;
  clearBtn.classList.toggle("hidden", v === "");

  clearTimeout(debounce);
  if (!v.trim() && activeCategory === "all") { showState("idle"); return; }
  showState("loading");
  debounce = setTimeout(() => renderResults(search(searchTerm, activeCategory)), 280);
});

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  searchTerm = "";
  clearBtn.classList.add("hidden");
  searchInput.focus();
  if (activeCategory === "all") showState("idle");
  else renderResults(search("", activeCategory));
});

document.querySelectorAll(".quick-tag").forEach(btn => {
  btn.addEventListener("click", () => {
    const q = btn.dataset.query;
    searchInput.value = q;
    searchTerm = q;
    clearBtn.classList.remove("hidden");
    showState("loading");
    setTimeout(() => renderResults(search(q, activeCategory)), 200);
  });
});

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    activeCategory = btn.dataset.category;

    if (!searchTerm.trim() && activeCategory === "all") { showState("idle"); return; }
    showState("loading");
    setTimeout(() => renderResults(search(searchTerm, activeCategory)), 150);
  });
});

modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

// ============================================================
//  UTILITY
// ============================================================
function esc(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ============================================================
//  BOOT
// ============================================================
(function boot() {
  const minSplash = new Promise(r => setTimeout(r, 1800));
  const dataLoad  = loadAllData().catch(err => {
    console.error("Firebase error:", err);
    connectionDot.className = "status-dot status-error";
    connectionDot.title = "Error de conexión";
    emptyMessage.textContent = "No se pudo conectar a Firebase. Verifica tus credenciales en app.js.";
    showState("empty");
  });

  Promise.all([minSplash, dataLoad]).then(() => {
    splashEl.style.transition = "opacity 0.4s ease";
    splashEl.style.opacity    = "0";
    setTimeout(() => {
      splashEl.classList.add("hidden");
      appEl.classList.remove("hidden");
    }, 400);
  });
})();
