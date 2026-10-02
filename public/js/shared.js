(function () {
  function esc(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function money(value) {
    const digits = Number.isInteger(value) ? 0 : 2;
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }

  function time(iso) {
    return new Intl.DateTimeFormat("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  }

  function pad(id) {
    return String(id).padStart(2, "0");
  }

  function watch(onState, onStatus) {
    let source;
    function open() {
      source = new EventSource("/api/events");
      source.onopen = () => onStatus(true);
      source.onerror = () => onStatus(false);
      source.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "state") onState(message.state);
      };
    }
    open();
    return () => source && source.close();
  }

  async function post(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "İşlem olmadı.");
    return payload;
  }

  window.Tezgah = { esc, money, time, pad, watch, post };
})();
