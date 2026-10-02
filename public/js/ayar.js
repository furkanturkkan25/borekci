(function () {
  const { esc, money, post } = window.Tezgah;
  const form = document.getElementById("form");
  const tablesEl = document.getElementById("tables");
  const listEl = document.getElementById("items");
  const noteEl = document.getElementById("note");
  let groups = [];
  let open = null;

  function note(message, ok) {
    noteEl.textContent = message || "";
    noteEl.classList.toggle("is-ok", Boolean(ok));
  }

  function clampTables(value) {
    const number = Number(value);
    if (!Number.isInteger(number)) return 1;
    return Math.min(40, Math.max(1, number));
  }

  function fromItems(items) {
    const next = [];
    for (const item of items) {
      const name = item.group || "Menü";
      if (!next.length || next[next.length - 1].name !== name) {
        next.push({ name, items: [] });
      }
      next[next.length - 1].items.push({
        id: item.id || "",
        name: item.name,
        price: String(item.price),
      });
    }
    return next.length ? next : [{ name: "Menü", items: [] }];
  }

  function readAll() {
    listEl.querySelectorAll(".menu-group").forEach((section) => {
      const group = groups[Number(section.dataset.g)];
      if (!group) return;
      const title = section.querySelector(".group-title");
      if (title) group.name = title.value;
      const editor = section.querySelector(".dish-line.is-open");
      if (!editor) return;
      const item = group.items[Number(editor.dataset.i)];
      if (!item) return;
      item.name = editor.querySelector(".dish-name").value;
      item.price = editor.querySelector(".dish-price").value;
    });
  }

  function render() {
    listEl.innerHTML = groups.map((group, g) => `
      <section class="menu-group" data-g="${g}">
        <div class="group-head">
          <input class="group-title" value="${esc(group.name)}" maxlength="24" aria-label="Grup adı">
          <button class="group-drop" type="button" data-act="drop-group">Grubu sil</button>
        </div>
        ${group.items.map((item, i) => {
          const editing = open && open.g === g && open.i === i;
          if (!editing) {
            const price = item.price === "" ? "" : money(Number(String(item.price).replace(",", ".")) || 0);
            return `<button class="dish-line" type="button" data-g="${g}" data-i="${i}">
              <span>${esc(item.name || "Yeni ürün")}</span>
              <span class="price">${esc(price)}</span>
            </button>`;
          }
          return `<div class="dish-line is-open" data-g="${g}" data-i="${i}">
            <input class="dish-name" value="${esc(item.name)}" maxlength="40" aria-label="Ürün adı" placeholder="Ürün adı">
            <input class="dish-price" value="${esc(item.price)}" inputmode="decimal" aria-label="Fiyat" placeholder="0">
            <button class="dish-remove" type="button" data-act="remove">Kaldır</button>
          </div>`;
        }).join("")}
        <button class="group-add" type="button" data-act="add" data-g="${g}">Ekle</button>
      </section>
    `).join("");
    if (!open) return;
    const field = listEl.querySelector(".dish-line.is-open .dish-name");
    if (field) field.focus();
  }

  document.getElementById("tables-dec").addEventListener("click", () => {
    tablesEl.value = String(clampTables(Number(tablesEl.value) - 1));
  });
  document.getElementById("tables-inc").addEventListener("click", () => {
    tablesEl.value = String(clampTables(Number(tablesEl.value) + 1));
  });

  document.getElementById("add-group").addEventListener("click", () => {
    readAll();
    groups.push({ name: "Yeni grup", items: [{ id: "", name: "", price: "" }] });
    open = { g: groups.length - 1, i: 0 };
    render();
  });

  listEl.addEventListener("click", (event) => {
    const action = event.target.closest("[data-act]");
    if (action) {
      readAll();
      const g = Number(action.dataset.g ?? action.closest("[data-g]")?.dataset.g);
      if (action.dataset.act === "add") {
        groups[g].items.push({ id: "", name: "", price: "" });
        open = { g, i: groups[g].items.length - 1 };
        render();
        return;
      }
      if (action.dataset.act === "remove") {
        const i = Number(action.closest("[data-i]").dataset.i);
        groups[g].items.splice(i, 1);
        open = null;
        render();
        return;
      }
      if (action.dataset.act === "drop-group") {
        groups.splice(g, 1);
        if (!groups.length) groups.push({ name: "Menü", items: [] });
        open = null;
        render();
      }
      return;
    }
    const line = event.target.closest(".dish-line");
    if (!line || line.classList.contains("is-open")) return;
    readAll();
    open = { g: Number(line.dataset.g), i: Number(line.dataset.i) };
    render();
  });

  listEl.addEventListener("input", (event) => {
    const section = event.target.closest(".menu-group");
    if (!section) return;
    const group = groups[Number(section.dataset.g)];
    if (event.target.classList.contains("group-title")) {
      group.name = event.target.value;
      return;
    }
    const editor = event.target.closest(".dish-line.is-open");
    if (!editor) return;
    const item = group.items[Number(editor.dataset.i)];
    if (event.target.classList.contains("dish-name")) item.name = event.target.value;
    if (event.target.classList.contains("dish-price")) item.price = event.target.value;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    readAll();
    note("");
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    const items = groups.flatMap((group) => group.items
      .filter((item) => item.name.trim() || String(item.price).trim())
      .map((item) => ({
        id: item.id,
        name: item.name.trim(),
        group: group.name.trim() || "Menü",
        price: String(item.price).trim(),
      })));
    try {
      const menu = await post("/api/menu", {
        tables: clampTables(tablesEl.value),
        items,
      });
      groups = fromItems(menu.items);
      tablesEl.value = String(menu.tables);
      open = null;
      document.querySelectorAll("[data-shop]").forEach((node) => {
        node.textContent = menu.shop;
      });
      render();
      note("Kaydedildi. Garson ve kasa ekranı güncellendi.", true);
    } catch (error) {
      note(error.message, false);
    } finally {
      submit.disabled = false;
    }
  });

  fetch("/api/menu")
    .then((res) => res.json())
    .then((menu) => {
      document.title = `Ayar · ${menu.shop}`;
      document.querySelectorAll("[data-shop]").forEach((node) => {
        node.textContent = menu.shop;
      });
      tablesEl.value = String(menu.tables);
      groups = fromItems(menu.items);
      render();
    })
    .catch(() => note("Menü yüklenemedi.", false));
})();
