"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { randomUUID } = require("crypto");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const MENU_PATH = path.join(ROOT, "data", "menu.json");
const STATE_PATH = path.join(ROOT, "data", "state.json");
const PORT = Number(process.env.PORT) || 4173;

const clients = new Set();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
};

const PAGES = {
  "/": "/index.html",
  "/garson": "/garson.html",
  "/kasa": "/kasa.html",
  "/ayar": "/ayar.html",
};

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readMenu() {
  const raw = JSON.parse(fs.readFileSync(MENU_PATH, "utf8"));
  const tables = Number(raw.tables);
  if (!Number.isInteger(tables) || tables < 1 || tables > 40) {
    throw fail(500, "Masa sayısı 1 ile 40 arasında olmalı.");
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw fail(500, "Menü boş.");
  }
  return {
    shop: String(raw.shop || "Börekçi").slice(0, 40),
    tables,
    items: raw.items.map((item) => ({
      id: String(item.id),
      name: String(item.name),
      price: Number(item.price),
      group: String(item.group || "Menü"),
    })),
  };
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
  }).format(new Date());
}

function blankState() {
  return { day: todayKey(), tables: {}, paid: [] };
}

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    if (!parsed || typeof parsed !== "object") return blankState();
    parsed.tables = parsed.tables && typeof parsed.tables === "object" ? parsed.tables : {};
    parsed.paid = Array.isArray(parsed.paid) ? parsed.paid : [];
    if (parsed.day !== todayKey()) parsed.day = todayKey();
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") return blankState();
    throw error;
  }
}

function writeState(state) {
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}

function writeMenu(menu) {
  const tmp = `${MENU_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(menu, null, 2));
  fs.renameSync(tmp, MENU_PATH);
}

function slugify(name) {
  const letters = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u" };
  const base = String(name)
    .split("")
    .map((char) => letters[char] || char)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return base || "urun";
}

function parsePrice(value) {
  const raw = String(value).trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw fail(400, "Fiyat geçersiz.");
  const price = Number(raw);
  if (price > 100000) throw fail(400, "Fiyat çok yüksek.");
  return price;
}

function saveMenu(state, body) {
  const tables = Number(body.tables);
  if (!Number.isInteger(tables) || tables < 1 || tables > 40) {
    throw fail(400, "Masa sayısı 1 ile 40 arasında olmalı.");
  }
  const blocked = Object.keys(state.tables)
    .map(Number)
    .filter((id) => id > tables && state.tables[String(id)]?.batches?.length)
    .sort((a, b) => a - b);
  if (blocked.length) {
    throw fail(400, `Önce şu masaların hesabını kapat: ${blocked.join(", ")}`);
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw fail(400, "Menüde en az bir ürün olmalı.");
  }
  if (body.items.length > 80) throw fail(400, "En fazla 80 ürün eklenebilir.");

  const seen = new Set();
  const items = body.items.map((item) => {
    const name = String(item.name || "").trim().slice(0, 40);
    if (!name) throw fail(400, "Ürün adı boş olamaz.");
    const group = String(item.group || "Menü").trim().slice(0, 24) || "Menü";
    const price = parsePrice(item.price);
    let id = String(item.id || "").trim();
    if (!/^[a-z0-9-]{1,40}$/.test(id) || seen.has(id)) {
      const base = slugify(name);
      id = base;
      let n = 2;
      while (seen.has(id)) {
        id = `${base}-${n}`;
        n += 1;
      }
    }
    seen.add(id);
    return { id, name, price, group };
  });

  let dropped = false;
  for (const key of Object.keys(state.tables)) {
    if (Number(key) > tables) {
      delete state.tables[key];
      dropped = true;
    }
  }
  if (dropped) writeState(state);

  const current = readMenu();
  const next = { shop: current.shop, tables, items };
  writeMenu(next);
  return next;
}

function lineTotal(items) {
  return items.reduce((sum, item) => sum + item.qty * item.price, 0);
}

function viewOf(state, menu) {
  const tables = [];
  for (let id = 1; id <= menu.tables; id += 1) {
    const stored = state.tables[String(id)];
    const batches = stored?.batches || [];
    tables.push({
      id,
      batches,
      total: batches.reduce((sum, batch) => sum + lineTotal(batch.items), 0),
      touched: stored?.touched || null,
    });
  }
  const paidToday = state.paid.filter((entry) => entry.day === state.day);
  return {
    shop: menu.shop,
    day: state.day,
    tables,
    catalog: menu.items,
    openTotal: tables.reduce((sum, table) => sum + table.total, 0),
    paidTotal: paidToday.reduce((sum, entry) => sum + entry.total, 0),
    paidCount: paidToday.length,
  };
}

function broadcast(view) {
  const body = `data: ${JSON.stringify({ type: "state", state: view })}\n\n`;
  for (const res of clients) {
    try {
      res.write(body);
    } catch {
      clients.delete(res);
    }
  }
}

function addOrder(state, menu, body) {
  const table = Number(body.table);
  if (!Number.isInteger(table) || table < 1 || table > menu.tables) {
    throw fail(400, "Masa bulunamadı.");
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw fail(400, "Sipariş boş.");
  }
  const items = body.items.map((line) => {
    const product = menu.items.find((item) => item.id === line.id);
    if (!product || !Number.isFinite(product.price)) {
      throw fail(400, "Menüde olmayan ürün.");
    }
    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 40) {
      throw fail(400, "Adet 1 ile 40 arasında olmalı.");
    }
    return {
      id: randomUUID(),
      menuId: product.id,
      name: product.name,
      price: product.price,
      qty,
    };
  });
  const key = String(table);
  if (!state.tables[key]) state.tables[key] = { batches: [] };
  const now = new Date().toISOString();
  state.tables[key].batches.push({
    id: randomUUID(),
    at: now,
    note: String(body.note || "").trim().slice(0, 140),
    items,
  });
  state.tables[key].touched = now;
}

function setQty(state, body) {
  const table = Number(body.table);
  const stored = state.tables[String(table)];
  if (!stored) throw fail(404, "Bu masa boş.");
  const batch = stored.batches.find((entry) => entry.id === body.batchId);
  if (!batch) throw fail(404, "Sipariş bulunamadı.");
  const item = batch.items.find((entry) => entry.id === body.itemId);
  if (!item) throw fail(404, "Kalem bulunamadı.");
  const qty = Number(body.qty);
  if (!Number.isInteger(qty) || qty < 0 || qty > 40) {
    throw fail(400, "Adet geçersiz.");
  }
  if (qty === 0) batch.items = batch.items.filter((entry) => entry.id !== item.id);
  else item.qty = qty;
  stored.batches = stored.batches.filter((entry) => entry.items.length > 0);
  if (stored.batches.length === 0) delete state.tables[String(table)];
  else stored.touched = new Date().toISOString();
}

function closeTable(state, body) {
  const table = Number(body.table);
  const key = String(table);
  const stored = state.tables[key];
  if (!stored || stored.batches.length === 0) throw fail(404, "Bu masa zaten boş.");
  const lines = stored.batches.flatMap((batch) =>
    batch.items.map((item) => ({
      name: item.name,
      qty: item.qty,
      price: item.price,
    }))
  );
  const total = stored.batches.reduce((sum, batch) => sum + lineTotal(batch.items), 0);
  state.paid.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    day: state.day,
    table,
    total,
    lines,
  });
  if (state.paid.length > 400) state.paid = state.paid.slice(-400);
  delete state.tables[key];
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 100000) {
        reject(fail(413, "İstek çok büyük."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(fail(400, "Geçersiz istek."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function serveStatic(res, pathname) {
  const rel = (PAGES[pathname] || pathname).replace(/^\/+/, "");
  const file = path.resolve(PUBLIC_DIR, rel);
  if (file !== PUBLIC_DIR && !file.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    sendJson(res, 403, { error: "Yasak." });
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      sendJson(res, 404, { error: "Sayfa yok." });
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

function mutate(res, change) {
  const menu = readMenu();
  const state = readState();
  change(state, menu);
  writeState(state);
  const view = viewOf(state, menu);
  broadcast(view);
  sendJson(res, 200, view);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/favicon.ico") {
      res.writeHead(302, { Location: "/favicon.svg" });
      res.end();
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/menu") {
      sendJson(res, 200, readMenu());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/menu") {
      const body = await readBody(req);
      const state = readState();
      const menu = saveMenu(state, body);
      const view = viewOf(state, menu);
      broadcast(view);
      sendJson(res, 200, menu);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/state") {
      sendJson(res, 200, viewOf(readState(), readMenu()));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("\n");
      const view = viewOf(readState(), readMenu());
      res.write(`data: ${JSON.stringify({ type: "state", state: view })}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/orders") {
      const body = await readBody(req);
      mutate(res, (state, menu) => addOrder(state, menu, body));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/qty") {
      const body = await readBody(req);
      mutate(res, (state) => setQty(state, body));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/close") {
      const body = await readBody(req);
      mutate(res, (state) => closeTable(state, body));
      return;
    }
    if (req.method === "GET") {
      serveStatic(res, decodeURIComponent(url.pathname));
      return;
    }
    sendJson(res, 405, { error: "Yöntem yok." });
  } catch (error) {
    if (res.headersSent) return;
    sendJson(res, error.status || 500, { error: error.message || "Sunucu hatası." });
  }
});

setInterval(() => {
  for (const res of clients) {
    try {
      res.write(": ping\n\n");
    } catch {
      clients.delete(res);
    }
  }
}, 20000).unref();

server.listen(PORT, "0.0.0.0", () => {
  const locals = [];
  let nets = {};
  try {
    nets = os.networkInterfaces();
  } catch {
    nets = {};
  }
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      const family = net.family;
      if ((family === "IPv4" || family === 4) && !net.internal) locals.push(net.address);
    }
  }
  console.log("Börekçi tezgahı hazır.");
  console.log(`Bu bilgisayar: http://localhost:${PORT}`);
  for (const ip of locals) console.log(`Aynı Wi-Fi: http://${ip}:${PORT}`);
});
