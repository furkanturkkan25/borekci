(function () {
  const { esc, money, pad, watch, post } = window.Tezgah;
  const tablesEl = document.getElementById("tables");
  const menuEl = document.getElementById("menu");
  const slipBody = document.getElementById("slip-body");
  const slipTable = document.getElementById("slip-table");
  const noteEl = document.getElementById("note");
  const errorEl = document.getElementById("slip-error");
  const sendBtn = document.getElementById("send");
  const linkEl = document.getElementById("link");

  let menu = null;
  let state = null;
  let tableId = Number(sessionStorage.getItem("borekci-table") || 1);
  let drafts = loadMap("borekci-drafts");
  let notes = loadMap("borekci-notes");
  let busy = false;

  function loadMap(key) {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(key) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveMaps() {
    sessionStorage.setItem("borekci-drafts", JSON.stringify(drafts));
    sessionStorage.setItem("borekci-notes", JSON.stringify(notes));
    sessionStorage.setItem("borekci-table", String(tableId));
  }

  function draftOf() {
    if (!Array.isArray(drafts[tableId])) drafts[tableId] = [];
    return drafts[tableId];
  }

  function draftTotal() {
    return draftOf().reduce((sum, line) => sum + line.qty * line.price, 0);
  }

  function currentTable() {
    return state?.tables?.find((table) => table.id === tableId) || null;
  }

  function showError(message) {
    errorEl.hidden = !message;
    errorEl.textContent = message || "";
  }

  function renderTables() {
    if (!state) return;
    tablesEl.innerHTML = state.tables.map((table) => {
      const on = table.id === tableId ? " is-on" : "";
      const bill = table.total > 0 ? " has-bill" : "";
      const pressed = table.id === tableId ? "true" : "false";
      return `<button class="seat${on}${bill}" type="button" role="tab" aria-pressed="${pressed}" data-table="${table.id}">${pad(table.id)}</button>`;
    }).join("");
  }

  function renderMenu() {
    if (!menu) return;
    const counts = new Map(draftOf().map((line) => [line.menuId, line.qty]));
    const groups = [];
    for (const item of menu.items) {
      let group = groups.find((entry) => entry.name === item.group);
      if (!group) {
        group = { name: item.group, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    }
    menuEl.innerHTML = groups.map((group) => `
      <section class="group">
        <h2>${esc(group.name)}</h2>
        ${group.items.map((item) => {
          const count = counts.get(item.id) || "";
          return `<button class="dish" type="button" data-id="${esc(item.id)}">
            <span>${esc(item.name)}</span>
            <span class="price">${esc(money(item.price))}</span>
            <span class="count">${count}</span>
          </button>`;
        }).join("")}
      </section>
    `).join("");
  }

  function lineHtml(line, attrs) {
    return `<div class="line" ${attrs}>
      <div class="steps">
        <button class="step" type="button" data-act="dec" aria-label="Azalt">−</button>
        <span class="qty">${line.qty}</span>
        <button class="step" type="button" data-act="inc" aria-label="Arttır">+</button>
      </div>
      <span class="name">${esc(line.name)}</span>
      <span class="money">${esc(money(line.qty * line.price))}</span>
    </div>`;
  }

  function renderSlip() {
    slipTable.textContent = pad(tableId);
    const table = currentTable();
    const open = table && table.batches.length
      ? `<p class="slip-label">Açık hesap · ${esc(money(table.total))}</p>
        ${table.batches.map((batch) => batch.items.map((item) => lineHtml(item, `data-kind="open" data-batch="${esc(batch.id)}" data-item="${esc(item.id)}"`)).join("")).join("")}`
      : "";
    const draft = draftOf();
    const pending = draft.length
      ? `<p class="slip-label">Eklenecek</p>
        ${draft.map((line, index) => lineHtml(line, `data-kind="draft" data-index="${index}"`)).join("")}`
      : `<p class="slip-label">Ürüne bas, adisyona ekle</p>`;
    slipBody.innerHTML = open + pending;
    const total = draftTotal();
    sendBtn.disabled = busy || total === 0;
    sendBtn.textContent = total ? `Gönder · ${money(total)}` : "Gönder";
    if (document.activeElement !== noteEl) noteEl.value = notes[tableId] || "";
  }

  function addDish(id) {
    const product = menu.items.find((item) => item.id === id);
    if (!product) return;
    const draft = draftOf();
    const existing = draft.find((line) => line.menuId === id);
    if (existing) {
      if (existing.qty < 40) existing.qty += 1;
    } else {
      draft.push({ menuId: product.id, name: product.name, price: product.price, qty: 1 });
    }
    saveMaps();
    showError("");
    renderMenu();
    renderSlip();
  }

  async function changeOpen(row, delta) {
    const qtyEl = row.querySelector(".qty");
    const qty = Number(qtyEl.textContent) + delta;
    if (busy) return;
    busy = true;
    renderSlip();
    try {
      state = await post("/api/qty", {
        table: tableId,
        batchId: row.dataset.batch,
        itemId: row.dataset.item,
        qty,
      });
      showError("");
    } catch (error) {
      showError(error.message);
    } finally {
      busy = false;
      renderTables();
      renderSlip();
    }
  }

  function changeDraft(index, delta) {
    const draft = draftOf();
    const line = draft[index];
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) draft.splice(index, 1);
    if (line.qty > 40) line.qty = 40;
    saveMaps();
    renderMenu();
    renderSlip();
  }

  tablesEl.addEventListener("click", (event) => {
    const seat = event.target.closest("[data-table]");
    if (!seat) return;
    tableId = Number(seat.dataset.table);
    saveMaps();
    showError("");
    renderTables();
    renderMenu();
    renderSlip();
  });

  menuEl.addEventListener("click", (event) => {
    const dish = event.target.closest(".dish");
    if (!dish || busy) return;
    addDish(dish.dataset.id);
  });

  slipBody.addEventListener("click", (event) => {
    const step = event.target.closest("[data-act]");
    if (!step) return;
    const row = step.closest(".line");
    const delta = step.dataset.act === "inc" ? 1 : -1;
    if (row.dataset.kind === "open") changeOpen(row, delta);
    else changeDraft(Number(row.dataset.index), delta);
  });

  noteEl.addEventListener("input", () => {
    notes[tableId] = noteEl.value;
    saveMaps();
  });

  sendBtn.addEventListener("click", async () => {
    const items = draftOf().map((line) => ({ id: line.menuId, qty: line.qty }));
    if (!items.length || busy) return;
    busy = true;
    sendBtn.disabled = true;
    try {
      state = await post("/api/orders", {
        table: tableId,
        note: notes[tableId] || "",
        items,
      });
      drafts[tableId] = [];
      notes[tableId] = "";
      noteEl.value = "";
      saveMaps();
      showError("");
    } catch (error) {
      showError(error.message);
    } finally {
      busy = false;
      renderTables();
      renderMenu();
      renderSlip();
    }
  });

  let catalogKey = "";

  function applyCatalog(items) {
    if (!Array.isArray(items)) return;
    const key = JSON.stringify(items);
    if (key === catalogKey) return;
    catalogKey = key;
    menu = { ...(menu || {}), items };
    const ids = new Set(items.map((item) => item.id));
    for (const tableKey of Object.keys(drafts)) {
      drafts[tableKey] = (drafts[tableKey] || []).filter((line) => ids.has(line.menuId));
    }
    saveMaps();
    renderMenu();
  }

  watch((next) => {
    state = next;
    document.title = `Garson · ${state.shop}`;
    document.querySelectorAll("[data-shop]").forEach((node) => {
      node.textContent = state.shop;
    });
    applyCatalog(next.catalog);
    if (!state.tables.some((table) => table.id === tableId)) tableId = state.tables[0]?.id || 1;
    renderTables();
    renderSlip();
  }, (online) => {
    linkEl.classList.toggle("is-off", !online);
    document.getElementById("status").textContent = online ? "Bağlı" : "Bağlantı koptu";
  });

  fetch("/api/menu")
    .then((res) => res.json())
    .then((payload) => {
      menu = payload;
      catalogKey = JSON.stringify(payload.items);
      renderMenu();
    })
    .catch(() => showError("Menü yüklenemedi."));
})();
