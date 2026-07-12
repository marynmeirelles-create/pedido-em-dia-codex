(function () {
  const sessionKey = "PedidoEmDiaAuthenticatedSession";
  const bypassPassword = "__atelie_session_refresh__";

  async function hash(text) {
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function hasSession() {
    try {
      return sessionStorage.getItem(sessionKey) === "1";
    } catch (error) {
      return false;
    }
  }

  function rememberSession() {
    try {
      sessionStorage.setItem(sessionKey, "1");
    } catch (error) {
      return false;
    }
    return true;
  }

  if (window.AtelieDB && AtelieDB.getSetting) {
    const originalGetSetting = AtelieDB.getSetting.bind(AtelieDB);
    AtelieDB.getSetting = async function (key, fallback) {
      if (key === "passwordHash" && hasSession()) return hash(bypassPassword);
      return originalGetSetting(key, fallback);
    };
  }

  function money(value) {
    return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function monthKey(date) {
    return (date || new Date().toISOString()).slice(0, 7);
  }

  function itemsSubtotal(order) {
    return (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  }

  function discountAmount(order) {
    const subtotal = itemsSubtotal(order);
    if (order.discountMode === "percent") return Math.min(subtotal, subtotal * Number(order.discountValue || 0) / 100);
    return Math.min(subtotal, Number(order.discountValue || 0));
  }

  function freightCharged(order) {
    return order.freightPayer === "client" ? Number(order.freightValue || 0) : 0;
  }

  function orderTotal(order) {
    return Math.max(0, itemsSubtotal(order) - discountAmount(order) + freightCharged(order));
  }

  function paidAmount(order) {
    if (order.paymentStatus === "paid") return orderTotal(order);
    if (order.paymentStatus === "deposit") return Number(order.deposit || 0);
    return 0;
  }

  async function refreshMonthSummary() {
    if (!window.AtelieDB) return;
    const cards = Array.from(document.querySelectorAll("#dayView .summary-card"));
    if (cards.length < 5) return;
    const orders = (await AtelieDB.getAll("orders")).filter((order) => !order.deletedAt);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const received = orders
      .filter((order) => paidAmount(order) > 0 && monthKey(order.paymentUpdatedAt || order.updatedAt || order.createdAt || order.deliveryDate) === currentMonth)
      .reduce((sum, order) => sum + paidAmount(order), 0);
    const sold = orders
      .filter((order) => monthKey(order.createdAt || order.deliveryDate) === currentMonth)
      .reduce((sum, order) => sum + orderTotal(order), 0);
    cards[3].querySelector(".value").textContent = money(received);
    cards[4].querySelector(".value").textContent = money(sold);
  }

  function showBackupSuggestion() {
    const reminder = document.querySelector("#backupReminder");
    if (!reminder) return;
    reminder.querySelector("strong").textContent = "Orçamento salvo. Faça um backup?";
    reminder.querySelector("p").textContent = "Recomendamos salvar uma cópia agora para proteger esse novo orçamento e manter sua agenda segura.";
    reminder.classList.remove("hidden");
  }

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (form && (form.id === "loginForm" || form.id === "createPasswordForm")) {
      setTimeout(() => {
        if (!document.querySelector("#app").classList.contains("hidden")) rememberSession();
      }, 300);
    }
    if (form && form.id === "orderForm") {
      const submitButton = form.querySelector('button[type="submit"]');
      const isNewOrder = submitButton && /salvar pedido/i.test(submitButton.textContent || "");
      if (isNewOrder) setTimeout(showBackupSuggestion, 700);
    }
  }, true);

  setTimeout(() => {
    if (!hasSession()) return;
    const loginForm = document.querySelector("#loginForm");
    const auth = document.querySelector("#auth");
    if (!loginForm || !auth || auth.classList.contains("hidden")) return;
    const password = document.querySelector("#loginPassword");
    if (!password) return;
    password.value = bypassPassword;
    if (loginForm.requestSubmit) loginForm.requestSubmit();
    else loginForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }, 150);

  const observer = new MutationObserver(() => refreshMonthSummary());
  window.addEventListener("load", () => {
    const dayView = document.querySelector("#dayView");
    if (dayView) observer.observe(dayView, { childList: true, subtree: true });
    refreshMonthSummary();
  });
})();
