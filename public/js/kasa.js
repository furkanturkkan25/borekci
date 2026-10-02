(function () {
  const { esc, money, time, pad, watch, post } = window.Tezgah;
  const board = document.getElementById("board");
  const meta = document.getElementById("meta");
  const clock = document.getElementById("clock");
  const toast = document.getElementById("toast");
  const linkEl = document.getElementById("link");
  const sheet = document.getElementById("sheet");
  const sheetTitle = document.getElementById("sheet-title");
  const sheetLines = document.getElementById("sheet-lines");
  const payBtn = document.getElementById("pay");

  let state = null;
  let known = new Map();
  let primed = false;
  let openId = null;
  let armed = false;
  let audioCtx = null;
  const flashing = new Set();

  function tick() {
    clock.textContent = new Intl.DateTimeFormat("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
  }
  tick();
  setInterval(tick, 1000);

  function batchKey(table) {
    return table.batches.map((batch) => batch.id).join(",");
  }

  function chime() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const gain = audioCtx.createGain();
    const tone = audioCtx.createOscillator();
    tone.type = "sine";
    tone.frequency.setValueAtTime(523, now);
    tone.frequency.setValueAtTime(784, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    tone.connect(gain);
    gain.connect(audioCtx.destination);
    tone.start(now);
    tone.stop(now + 0.45);
  }

  function announce(ids) {
    const label = ids.map((id) => pad(id)).join(", ");
    toast.textContent = `Masa ${label} — yeni sipariş`;
    toast.classList.remove("show");
    void toast.offsetWidth;
    toast.classList.add("show");
    document.title = `Masa ${label} yeni sipariş`;
    setTimeout(() => {
      if (state) document.title = `${state.shop} · Kasa`;
    }, 4000);
    chime();
    for (const id of ids) {
      flashing.add(id);
      setTimeout(() => flashing.delete(id), 1200);
    }
  }

  function renderBoard() {
    const openCount = state.tables.filter((table) => table.total > 0).length;
    meta.innerHTML = openCount
      ? `<strong>${openCount} masa açık</strong> · bugün ${esc(money(state.paidTotal))}`
      : `Açık masa yok · bugün ${esc(money(state.paidTotal))}`;
    board.innerHTML = state.tables.map((table) => {
      if (!table.batches.length) {
        return `<div class="bill" data-table="${table.id}">
          <span class="num">${pad(table.id)}</span>
          <span class="quiet">Boş</span>
        </div>`;
      }
      const fresh = flashing.has(table.id) ? " is-fresh" : "";
      const batches = table.batches.map((batch) => `
        <div class="batch">
          <time>${esc(time(batch.at))}</time>
          ${batch.note ? `<span class="note">${esc(batch.note)}</span>` : ""}
          <ul>
            ${batch.items.map((item) => `<li><b>${item.qty}</b> ${esc(item.name)}</li>`).join("")}
          </ul>
        </div>
      `).join("");
      return `<div class="bill is-open${fresh}" role="button" tabindex="0" data-table="${table.id}">
        <span class="num">${pad(table.id)}</span>
        <div class="bill-lines">${batches}</div>
        <span class="bill-total"><span>Toplam</span><span>${esc(money(table.total))}</span></span>
      </div>`;
    }).join("");
  }

  function renderSheet() {
    const table = state.tables.find((entry) => entry.id === openId);
    if (!table || !table.batches.length) {
      if (sheet.open) sheet.close();
      openId = null;
      return;
    }
    sheetTitle.textContent = pad(table.id);
    sheetLines.innerHTML = table.batches.map((batch) => `
      <section class="sheet-batch">
        <time>${esc(time(batch.at))}</time>
        ${batch.note ? `<p class="note">${esc(batch.note)}</p>` : ""}
        ${batch.items.map((item) => `
          <div class="line" data-batch="${esc(batch.id)}" data-item="${esc(item.id)}">
            <div class="steps">
              <button class="step" type="button" data-act="dec" aria-label="Azalt">−</button>
              <span class="qty">${item.qty}</span>
              <button class="step" type="button" data-act="inc" aria-label="Arttır">+</button>
            </div>
            <span class="name">${esc(item.name)}</span>
            <span class="money">${esc(money(item.qty * item.price))}</span>
          </div>
        `).join("")}
      </section>
    `).join("");
    if (!armed) payBtn.textContent = `Hesabı kapat · ${money(table.total)}`;
    payBtn.classList.toggle("is-armed", armed);
  }

  function applyState(next, fromRemote) {
    const arrived = [];
    if (primed) {
      for (const table of next.tables) {
        const key = batchKey(table);
        const previous = known.get(table.id);
        if (previous !== undefined && key !== previous && key.split(",").filter(Boolean).some((id) => !String(previous).split(",").includes(id))) {
          arrived.push(table.id);
        }
      }
    }
    known = new Map(next.tables.map((table) => [table.id, batchKey(table)]));
    primed = true;
    state = next;
    document.querySelectorAll("[data-shop]").forEach((node) => {
      node.textContent = state.shop;
    });
    if (arrived.length && fromRemote) announce(arrived);
    if (!document.title.startsWith("Masa")) document.title = `${state.shop} · Kasa`;
    renderBoard();
    if (openId) renderSheet();
  }

  board.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const bill = event.target.closest("[data-table]");
    if (!bill) return;
    event.preventDefault();
    bill.click();
  });

  board.addEventListener("click", (event) => {
    const bill = event.target.closest("[data-table]");
    if (!bill) return;
    const id = Number(bill.dataset.table);
    const table = state.tables.find((entry) => entry.id === id);
    if (!table || !table.batches.length) return;
    openId = id;
    armed = false;
    renderSheet();
    sheet.showModal();
  });

  document.getElementById("sheet-close").addEventListener("click", () => sheet.close());
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet) sheet.close();
  });
  sheet.addEventListener("close", () => {
    openId = null;
    armed = false;
  });

  sheetLines.addEventListener("click", async (event) => {
    const step = event.target.closest("[data-act]");
    if (!step || !openId) return;
    const row = step.closest(".line");
    const qty = Number(row.querySelector(".qty").textContent) + (step.dataset.act === "inc" ? 1 : -1);
    armed = false;
    try {
      applyState(await post("/api/qty", {
        table: openId,
        batchId: row.dataset.batch,
        itemId: row.dataset.item,
        qty,
      }), false);
    } catch (error) {
      toast.textContent = error.message;
      toast.classList.add("show");
    }
  });

  payBtn.addEventListener("click", async () => {
    if (!openId) return;
    if (!armed) {
      armed = true;
      payBtn.textContent = "Emin misin? Hesabı kapat";
      payBtn.classList.add("is-armed");
      return;
    }
    const table = openId;
    try {
      applyState(await post("/api/close", { table }), false);
      sheet.close();
      toast.textContent = `Masa ${pad(table)} hesap kapandı`;
      toast.classList.remove("show");
      void toast.offsetWidth;
      toast.classList.add("show");
    } catch (error) {
      toast.textContent = error.message;
      toast.classList.add("show");
    }
  });

  document.addEventListener("pointerdown", () => {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }, { once: true });

  watch((next) => applyState(next, true), (online) => {
    linkEl.classList.toggle("is-off", !online);
  });
})();
