(function () {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const state = { orders: [], clients: [], currentView: "day", editingId: null, editingClientId: null, agendaMonth: new Date().getMonth(), agendaYear: new Date().getFullYear() };

  const screenMeta = {
    day: ["Meu Dia", ""],
    clients: ["Clientes", "Cadastro e contatos"],
    agenda: ["Agenda", "Quando cada pedido vence?"],
    orders: ["Pedidos", "Como está cada encomenda?"],
    production: ["Produção", "O que precisa ser fabricado?"],
    dashboard: ["Dashboard", "Como está seu ateliê?"],
    more: ["Backup", "Proteja sua agenda"],
    form: ["Novo Pedido", "Vamos cadastrar uma encomenda"],
    detail: ["Pedido", "Detalhes da encomenda"]
  };

  const productionPhases = [
    ["send_art", "Enviar arte"],
    ["modify_art", "Modificar arte"],
    ["waiting_art_approval", "Aguardando aprovação da arte"],
    ["printed", "Pedido impresso"],
    ["cutting", "Corte"],
    ["assembly", "Montagem"],
    ["post", "Postar"],
    ["waiting_pickup", "Aguardando retirada"],
    ["send_tracking", "Enviar rastreio"],
    ["finished", "Pedido finalizado"]
  ];

  const phaseLabels = Object.fromEntries(productionPhases);

  function money(value) {
    return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function parseDate(date) {
    const [year, month, day] = (date || todayISO()).split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function daysUntil(date) {
    const a = parseDate(todayISO());
    const b = parseDate(date);
    return Math.ceil((b - a) / 86400000);
  }

  function formatDate(date) {
    if (!date) return "Sem data";
    return parseDate(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatDateTime(date) {
    if (!date) return "Nenhum backup realizado ainda";
    return new Date(date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2600);
  }

  async function hash(text) {
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
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

  function optionLabel(value, labels, fallback = "Não informado") {
    return labels[value] || fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function safeFileName(value) {
    return String(value || "pedido").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "pedido";
  }

  function pdfText(value) {
    return String(value ?? "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
  }

  function pdfEscape(value) {
    return pdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  function wrapPdfText(value, max = 62) {
    const words = pdfText(value).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > max) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function isoFromDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function easterDate(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function holidaysForYear(year) {
    const easter = easterDate(year);
    const holidays = {
      [`${year}-01-01`]: "Confraternização Universal",
      [`${year}-04-21`]: "Tiradentes",
      [`${year}-05-01`]: "Dia do Trabalho",
      [`${year}-09-07`]: "Independência do Brasil",
      [`${year}-10-12`]: "Nossa Senhora Aparecida",
      [`${year}-11-02`]: "Finados",
      [`${year}-11-15`]: "Proclamação da República",
      [`${year}-11-20`]: "Consciência Negra",
      [`${year}-12-25`]: "Natal"
    };
    holidays[isoFromDate(addDays(easter, -47))] = "Carnaval";
    holidays[isoFromDate(addDays(easter, -46))] = "Carnaval";
    holidays[isoFromDate(addDays(easter, -2))] = "Sexta-feira Santa";
    holidays[isoFromDate(easter)] = "Páscoa";
    holidays[isoFromDate(addDays(easter, 60))] = "Corpus Christi";
    return holidays;
  }

  function paidAmount(order) {
    if (order.paymentStatus === "paid") return orderTotal(order);
    if (order.paymentStatus === "deposit") return Number(order.deposit || 0);
    return 0;
  }

  function balance(order) {
    return Math.max(0, orderTotal(order) - paidAmount(order));
  }

  function status(order) {
    if (order.deletedAt) return ["Lixeira", "pending"];
    if (order.done) return ["Concluído", "done"];
    if (daysUntil(order.deliveryDate) <= 3) return ["Urgente", "urgent"];
    if (balance(order) > 0) return ["Pagamento pendente", "pending"];
    return ["Em produção", "production"];
  }

  function addHistory(order, text) {
    order.history = order.history || [];
    order.history.unshift({ at: new Date().toISOString(), text });
  }

  async function loadOrders() {
    state.orders = (await AtelieDB.getAll("orders")).sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || ""));
  }

  async function loadClients() {
    state.clients = (await AtelieDB.getAll("clients")).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }

  const rememberedPasswordKey = "atelieEmDiaRememberedPassword";

  function getRememberedPassword() {
    try {
      return localStorage.getItem(rememberedPasswordKey) || "";
    } catch (error) {
      return "";
    }
  }

  function setRememberedPassword(password) {
    try {
      if (password) localStorage.setItem(rememberedPasswordKey, password);
      else localStorage.removeItem(rememberedPasswordKey);
    } catch (error) {
      showToast("Não foi possível lembrar a senha neste navegador.");
    }
  }

  async function saveOrder(order, reason) {
    await AtelieDB.snapshot(reason);
    await AtelieDB.put("orders", order);
    await loadOrders();
    render();
  }

  async function checkAuth() {
    await AtelieDB.openDB();
    const passwordHash = await AtelieDB.getSetting("passwordHash");
    const welcomed = await AtelieDB.getSetting("welcomed", false);
    if (!welcomed) return showAuth("welcome");
    if (!passwordHash) return showAuth("create");
    showAuth("login");
  }

  function showAuth(mode) {
    $("#auth").classList.remove("hidden");
    $("#app").classList.add("hidden");
    $("#welcomePanel").classList.toggle("hidden", mode !== "welcome");
    $("#createPasswordForm").classList.toggle("hidden", mode !== "create");
    $("#loginForm").classList.toggle("hidden", mode !== "login");
    $("#authTitle").textContent = mode === "login" ? "Que bom te ver!" : mode === "create" ? "Crie sua senha" : "Bem-vinda!";
    $("#authText").textContent = mode === "login" ? "Digite sua senha para entrar." : mode === "create" ? "Ela protege o acesso neste dispositivo." : "Vamos organizar seu ateliê?";
    if (mode === "login") {
      const remembered = getRememberedPassword();
      $("#loginPassword").value = remembered;
      $("#rememberPassword").checked = Boolean(remembered);
    }
  }

  async function enterApp() {
    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");
    await loadOrders();
    await loadClients();
    await maybeShowBackupReminder();
    render();
  }

  function setScreen(view) {
    if (view === "production") view = "day";
    state.currentView = view;
    $$(".screen").forEach((screen) => screen.classList.add("hidden"));
    const map = {
      day: "#dayView",
      clients: "#clientsView",
      agenda: "#agendaView",
      orders: "#ordersView",
      production: "#productionView",
      dashboard: "#dashboardView",
      more: "#moreView",
      form: "#orderFormView",
      detail: "#orderDetailView"
    };
    $(map[view]).classList.remove("hidden");
    const [kicker, title] = screenMeta[view];
    $("#screenKicker").textContent = kicker;
    $("#screenTitle").textContent = title;
    $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    $("#fabNewOrder").classList.toggle("hidden", view === "form");
    render();
  }

  function activeOrders() {
    return state.orders.filter((order) => !order.deletedAt);
  }

  function todayTasks() {
    const orders = activeOrders();
    return {
      produzir: orders.filter((o) => !o.done && daysUntil(o.deliveryDate) <= 3),
      entregar: orders.filter((o) => o.deliveryDate === todayISO()),
      receber: orders.filter((o) => balance(o) > 0),
      atencao: orders.filter((o) => !o.done && daysUntil(o.deliveryDate) < 0)
    };
  }

  function emptyCard(title, text) {
    return `<div class="card"><h3>${title}</h3><p class="muted">${text}</p></div>`;
  }

  function orderButton(order) {
    const [label, cls] = status(order);
    const phase = order.productionPhase || (order.done ? "finished" : "send_art");
    return `
      <div class="order-row phase-${phase}">
        <button data-open-order="${order.id}">
          <strong>${order.client || "Cliente sem nome"}</strong>
          <span class="muted">${order.theme || "Sem tema"} · entrega ${formatDate(order.deliveryDate)}</span>
        </button>
        <div class="order-side">
          <span class="chip ${cls}">${label}</span>
          <label class="phase-select-label">Fase
            <select class="phase-select" data-phase-order="${order.id}">
              ${productionPhases.map(([value, text]) => `<option value="${value}" ${phase === value ? "selected" : ""}>${text}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>
    `;
  }

  function dayOrderCard(order) {
    const [label, cls] = status(order);
    const items = (order.items || []).map((item) => item.name).filter(Boolean).join(", ") || "Sem itens cadastrados";
    const note = order.notes || (order.child ? `${order.child}${order.age ? ` ${order.age} anos` : ""}` : "Sem observações.");
    return `
      <div class="day-order-card phase-${order.productionPhase || (order.done ? "finished" : "send_art")}">
        <button class="day-order-main" data-open-order="${order.id}">
          <span class="day-order-top">
            <strong>${order.client || "Cliente sem nome"}</strong>
            <span>Entrega: ${formatDate(order.deliveryDate)}</span>
          </span>
          <span class="day-order-chips">
            <span>${order.theme || "Sem tema"}</span>
            <span class="${cls}">${label}</span>
          </span>
          <span class="day-order-money">
            <span><strong>Total:</strong> ${money(orderTotal(order))}</span>
            <span><strong>Sinal:</strong> ${money(Number(order.deposit || 0))}</span>
            <span><strong>A receber:</strong> ${money(balance(order))}</span>
          </span>
          <em>Itens: ${items}</em>
          <em>Obs.: ${note}</em>
        </button>
        <div class="actions day-order-actions">
          <button class="btn btn-secondary" data-edit-order="${order.id}">Editar</button>
          <button class="btn btn-danger" data-trash-order="${order.id}">Excluir</button>
        </div>
      </div>
    `;
  }

  function renderDay() {
    const tasks = todayTasks();
    const orders = activeOrders();
    const monthKey = todayISO().slice(0, 7);
    const monthOrders = orders.filter((order) => ((order.deliveryDate || order.createdAt || "").slice(0, 7)) === monthKey);
    const openOrders = orders.filter((order) => !order.done);
    const pendingPaymentOrders = orders.filter((order) => balance(order) > 0);
    const receivedThisMonth = monthOrders.reduce((sum, order) => sum + paidAmount(order), 0);
    const soldThisMonth = monthOrders.reduce((sum, order) => sum + orderTotal(order), 0);
    const listedOrders = orders.slice().sort((a, b) => {
      if (a.done !== b.done) return Number(a.done) - Number(b.done);
      return (a.deliveryDate || "").localeCompare(b.deliveryDate || "");
    });
    $("#dayView").innerHTML = `
      <h3 class="day-heading">Resumo do ateliê</h3>
      <div class="grid day-summary">
        <div class="card summary-card day-square"><span class="summary-title"><span class="summary-icon">⚠</span><span class="label">Urgentes</span></span><span class="value">${tasks.produzir.length}</span><span class="muted">entrega nos próximos 3 dias</span></div>
        <div class="card summary-card day-square"><span class="summary-title"><span class="summary-icon">📋</span><span class="label">Em aberto</span></span><span class="value">${openOrders.length}</span><span class="muted">pedidos ainda não concluídos</span></div>
        <div class="card summary-card day-square"><span class="summary-title"><span class="summary-icon">💰</span><span class="label">A receber</span></span><span class="value">${money(pendingPaymentOrders.reduce((sum, o) => sum + balance(o), 0))}</span><span class="muted">pagamento pendente ou sinal pago</span></div>
        <div class="card summary-card day-square"><span class="summary-title"><span class="summary-icon">✅</span><span class="label">Recebido no mês</span></span><span class="value">${money(receivedThisMonth)}</span><span class="muted">valores pagos no mês atual</span></div>
        <div class="card summary-card day-wide"><span class="summary-title"><span class="summary-icon">📈</span><span class="label">Total vendido no mês</span></span><span class="value">${money(soldThisMonth)}</span><span class="muted">todos os pedidos do mês</span></div>
      </div>
      <div class="day-orders">
        ${listedOrders.length ? listedOrders.map(dayOrderCard).join("") : emptyCard("Nenhum pedido cadastrado", "Cadastre uma encomenda para começar sua agenda.")}
      </div>
      <button class="btn btn-primary full" data-new-order>+ Novo Pedido</button>
    `;
  }

  function renderOrders() {
    const term = ($("#orderSearch") && $("#orderSearch").value.toLowerCase()) || "";
    const orders = activeOrders().filter((order) => JSON.stringify(order).toLowerCase().includes(term));
    $("#ordersView").innerHTML = `
      <div class="card">
        <input id="orderSearch" type="search" placeholder="Pesquisar cliente, tema, item ou telefone" value="${term}">
      </div>
      <div class="order-list">${orders.length ? orders.map(orderButton).join("") : emptyCard("Nenhum pedido encontrado", "Cadastre uma encomenda para começar sua agenda.")}</div>
    `;
    $("#orderSearch").addEventListener("input", renderOrders);
  }

  function clientsFromOrders() {
    const map = new Map();
    for (const order of activeOrders()) {
      const key = (order.client || "").trim();
      if (!key) continue;
      const current = map.get(key) || { name: key, phone: order.phone || "", source: "Pedidos", orders: 0, total: 0 };
      current.phone = current.phone || order.phone || "";
      current.orders += 1;
      current.total += orderTotal(order);
      map.set(key, current);
    }
    return Array.from(map.values());
  }

  function clientRows() {
    const manual = state.clients.map((client) => ({
      ...client,
      displayName: `${client.name || ""} ${client.lastName || ""}`.trim() || "Cliente sem nome",
      source: "Cadastro",
      orders: activeOrders().filter((order) => order.client === `${client.name || ""} ${client.lastName || ""}`.trim() || order.client === client.name).length
    }));
    const orderClients = clientsFromOrders().filter((client) => !manual.some((item) => item.displayName === client.name || item.name === client.name));
    return [...manual, ...orderClients].sort((a, b) => (a.displayName || a.name || "").localeCompare(b.displayName || b.name || ""));
  }

  function renderClients() {
    const rows = clientRows();
    $("#clientsView").innerHTML = `
      <div class="card clients-hero">
        <div>
          <p class="eyebrow">Clientes</p>
          <h3>Cadastro de clientes</h3>
          <p class="muted">Organize dados de contato, documento, endereço e observações em um só lugar.</p>
        </div>
        <button class="btn btn-primary" data-new-client>Novo cliente</button>
      </div>
      <div id="clientFormBox" class="card client-form-card hidden"></div>
      <div class="client-list">
        ${rows.length ? rows.map((client) => `
          <div class="client-card">
            <div>
              <strong>${client.displayName || client.name}</strong>
              <span class="muted">${client.whatsapp || client.phone || "Sem WhatsApp"} · ${client.source}</span>
              <span class="muted">${client.city || ""}${client.state ? ` / ${client.state}` : ""}</span>
            </div>
            <div class="actions">
              ${client.id ? `<button class="btn btn-secondary" data-edit-client="${client.id}">Editar</button>` : ""}
            </div>
          </div>
        `).join("") : emptyCard("Nenhum cliente cadastrado", "Cadastre um cliente novo ou salve pedidos para criar contatos automaticamente.")}
      </div>
    `;
  }

  function renderClientForm(client = null) {
    state.editingClientId = client ? client.id : null;
    const data = client || { personType: "cpf" };
    $("#clientFormBox").classList.remove("hidden");
    $("#clientFormBox").innerHTML = `
      <form id="clientForm" class="client-form">
        <div class="client-type">
          <span>Seu cliente é pessoa física ou jurídica?</span>
          <div class="segmented">
            <label><input type="radio" name="personType" value="cpf" ${data.personType !== "cnpj" ? "checked" : ""}> Pessoa Física (CPF)</label>
            <label><input type="radio" name="personType" value="cnpj" ${data.personType === "cnpj" ? "checked" : ""}> Pessoa Jurídica (CNPJ)</label>
          </div>
        </div>
        <div class="form-grid client-grid">
          <label>CPF/CNPJ<input name="document" value="${data.document || ""}" placeholder="digite o documento do cliente"></label>
          <label>WhatsApp<input name="whatsapp" value="${data.whatsapp || ""}" inputmode="tel" placeholder="digite o número de celular/WhatsApp"></label>
          <label>Nome<input name="name" value="${data.name || ""}" placeholder="digite o nome do cliente" required></label>
          <label>Sobrenome<input name="lastName" value="${data.lastName || ""}" placeholder="digite o sobrenome do cliente"></label>
          <label>Data de nascimento<input name="birthDate" type="date" value="${data.birthDate || ""}"></label>
          <label>CEP<input name="zip" value="${data.zip || ""}" inputmode="numeric" placeholder="digite o CEP"></label>
          <label>Rua ou Avenida<input name="street" value="${data.street || ""}" placeholder="digite a rua ou avenida"></label>
          <label>Número<input name="number" value="${data.number || ""}" placeholder="número do endereço"></label>
          <label>Complemento<input name="complement" value="${data.complement || ""}" placeholder="complemento"></label>
          <label>Bairro<input name="neighborhood" value="${data.neighborhood || ""}" placeholder="bairro"></label>
          <label>Estado<input name="state" value="${data.state || ""}" placeholder="UF"></label>
          <label>Cidade<input name="city" value="${data.city || ""}" placeholder="cidade"></label>
          <label class="span-2">Observações<textarea name="notes" placeholder="Insira observações gerais sobre o cliente">${data.notes || ""}</textarea></label>
        </div>
        <div class="actions">
          <button class="btn btn-primary" type="submit">${client ? "Salvar cliente" : "Cadastrar cliente"}</button>
          <button class="btn btn-secondary" type="button" data-cancel-client>Cancelar</button>
        </div>
      </form>
    `;
    $("#clientFormBox").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderAgenda() {
    const now = new Date();
    const year = state.agendaYear;
    const month = state.agendaMonth;
    const currentYear = now.getFullYear();
    const yearOptions = Array.from({ length: 8 }, (_, index) => currentYear - 1 + index);
    const monthNames = Array.from({ length: 12 }, (_, index) => new Date(year, index, 1).toLocaleDateString("pt-BR", { month: "long" }));
    const holidays = holidaysForYear(year);
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const blanks = Array(first.getDay()).fill(null);
    const days = Array.from({ length: last.getDate() }, (_, i) => new Date(year, month, i + 1));
    const yearHolidays = Object.entries(holidays).sort(([a], [b]) => a.localeCompare(b));
    $("#agendaView").innerHTML = `
      <div class="card">
        <div class="section-head agenda-head">
          <h3>${new Date(year, month, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h3>
          <div class="agenda-controls">
            <label>Mês
              <select id="agendaMonth">
                ${monthNames.map((name, index) => `<option value="${index}" ${index === month ? "selected" : ""}>${name}</option>`).join("")}
              </select>
            </label>
            <label>Ano
              <select id="agendaYear">
                ${yearOptions.map((item) => `<option value="${item}" ${item === year ? "selected" : ""}>${item}</option>`).join("")}
              </select>
            </label>
          </div>
        </div>
        <div class="calendar">
          ${["D", "S", "T", "Q", "Q", "S", "S"].map((d) => `<strong class="muted">${d}</strong>`).join("")}
          ${blanks.map(() => "<span></span>").join("")}
          ${days.map((day) => {
            const iso = isoFromDate(day);
            const matches = activeOrders().filter((order) => order.deliveryDate === iso);
            const holiday = holidays[iso];
            return `<button class="day-cell ${iso === todayISO() ? "today" : ""}" data-day="${iso}">
              <strong>${day.getDate()}</strong>
              ${holiday ? `<span class="holiday-label">${holiday}</span>` : ""}
              <span class="muted">${matches.length ? `${matches.length} pedido(s)` : ""}</span>
              <span class="dots">${matches.slice(0, 4).map((order) => `<i class="dot ${status(order)[1]}"></i>`).join("")}</span>
            </button>`;
          }).join("")}
        </div>
      </div>
      <div id="dayOrders" class="order-list"></div>
      <div class="card">
        <h3>Feriados de ${year}</h3>
        <div class="holiday-list">
          ${yearHolidays.map(([date, name]) => `<div class="holiday-row"><strong>${formatDate(date)}</strong><span>${name}</span></div>`).join("")}
        </div>
      </div>
    `;
    $("#agendaMonth").addEventListener("change", (event) => {
      state.agendaMonth = Number(event.target.value);
      renderAgenda();
    });
    $("#agendaYear").addEventListener("change", (event) => {
      state.agendaYear = Number(event.target.value);
      renderAgenda();
    });
  }

  function showDayOrders(date) {
    const orders = activeOrders().filter((order) => order.deliveryDate === date);
    $("#dayOrders").innerHTML = orders.length
      ? `<div class="card"><h3>Entregas de ${formatDate(date)}</h3><div class="order-list">${orders.map(orderButton).join("")}</div></div>`
      : emptyCard("Sem entregas nesse dia", "A agenda está livre nessa data.");
  }

  function renderProduction() {
    const orders = activeOrders().filter((order) => !order.done).sort((a, b) => daysUntil(a.deliveryDate) - daysUntil(b.deliveryDate));
    $("#productionView").innerHTML = orders.length
      ? `<div class="order-list">${orders.map((order) => `
          <div class="card">
            <div class="section-head">
              <button class="link-panel" data-open-order="${order.id}"><h3>${order.theme || "Pedido sem tema"}</h3><p class="muted">${order.client} · entrega ${formatDate(order.deliveryDate)}</p></button>
              <span class="chip ${status(order)[1]}">${status(order)[0]}</span>
            </div>
            <div class="task-list">
              ${(order.items || []).map((item) => `<div class="task"><strong>${item.quantity || 0} × ${item.name || "Item"}</strong><span class="muted">${money(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</span></div>`).join("")}
            </div>
            <div class="actions"><button class="btn btn-success" data-complete-order="${order.id}">Concluir produção</button><button class="btn btn-secondary" data-open-order="${order.id}">Abrir pedido</button></div>
          </div>
        `).join("")}</div>`
      : emptyCard("Produção em dia", "Não há pedidos em produção agora.");
  }

  function renderDashboard() {
    const orders = activeOrders();
    const total = orders.reduce((sum, order) => sum + orderTotal(order), 0);
    const received = orders.reduce((sum, order) => sum + paidAmount(order), 0);
    const pending = orders.reduce((sum, order) => sum + balance(order), 0);
    const done = orders.filter((order) => order.done).length;
    $("#dashboardView").innerHTML = `
      <div class="grid three">
        <div class="card summary-card"><span class="label">Total vendido</span><span class="value">${money(total)}</span><span class="muted">${orders.length} pedidos</span></div>
        <div class="card summary-card"><span class="label">Recebido</span><span class="value">${money(received)}</span><span class="muted">entradas registradas</span></div>
        <div class="card summary-card"><span class="label">A receber</span><span class="value">${money(pending)}</span><span class="muted">pagamentos pendentes</span></div>
        <div class="card summary-card"><span class="label">Ticket médio</span><span class="value">${money(orders.length ? total / orders.length : 0)}</span><span class="muted">por pedido</span></div>
        <div class="card summary-card"><span class="label">Concluídos</span><span class="value">${done}</span><span class="muted">entregas finalizadas</span></div>
        <div class="card summary-card"><span class="label">Urgentes</span><span class="value">${orders.filter((o) => !o.done && daysUntil(o.deliveryDate) <= 3).length}</span><span class="muted">até 3 dias</span></div>
      </div>
    `;
  }

  function groupOrdersBy(field) {
    const map = new Map();
    for (const order of activeOrders()) {
      const key = (order[field] || "").trim() || "Não informado";
      const current = map.get(key) || { name: key, orders: [], total: 0 };
      current.orders.push(order);
      current.total += orderTotal(order);
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }

  function customerInsights() {
    return groupOrdersBy("client").map((item) => {
      const latest = item.orders.slice().sort((a, b) => (b.deliveryDate || "").localeCompare(a.deliveryDate || ""))[0] || {};
      return { ...item, phone: latest.phone || "", lastDate: latest.deliveryDate };
    });
  }

  function childInsights() {
    return groupOrdersBy("child").map((item) => {
      const latest = item.orders.slice().sort((a, b) => (b.partyDate || "").localeCompare(a.partyDate || ""))[0] || {};
      const themes = Array.from(new Set(item.orders.map((order) => order.theme).filter(Boolean))).slice(0, 3);
      return { ...item, age: latest.age || "", partyDate: latest.partyDate, themes };
    });
  }

  function productInsights() {
    const map = new Map();
    for (const order of activeOrders()) {
      for (const item of order.items || []) {
        const name = (item.name || "").trim() || "Item sem nome";
        const current = map.get(name) || { name, quantity: 0, total: 0, orders: 0 };
        current.quantity += Number(item.quantity || 0);
        current.total += Number(item.quantity || 0) * Number(item.unitPrice || 0);
        current.orders += 1;
        map.set(name, current);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }

  function kitInsights() {
    const themes = groupOrdersBy("theme").filter((theme) => theme.name !== "Não informado");
    return themes.map((theme) => {
      const items = new Map();
      for (const order of theme.orders) {
        for (const item of order.items || []) {
          const name = (item.name || "").trim();
          if (!name) continue;
          items.set(name, (items.get(name) || 0) + Number(item.quantity || 0));
        }
      }
      return {
        ...theme,
        items: Array.from(items.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4)
      };
    }).filter((theme) => theme.items.length);
  }

  function v2Tasks() {
    const orders = activeOrders();
    return [
      ...orders.filter((order) => !order.done && daysUntil(order.deliveryDate) < 0).map((order) => ({ kind: "Atrasado", order })),
      ...orders.filter((order) => !order.done && order.deliveryDate === todayISO()).map((order) => ({ kind: "Entrega hoje", order })),
      ...orders.filter((order) => !order.done && daysUntil(order.deliveryDate) > 0 && daysUntil(order.deliveryDate) <= 3).map((order) => ({ kind: "Próximos 3 dias", order })),
      ...orders.filter((order) => balance(order) > 0).map((order) => ({ kind: "Pagamento pendente", order }))
    ].slice(0, 10);
  }

  function monthlyReports() {
    const map = new Map();
    for (const order of activeOrders()) {
      const sourceDate = order.deliveryDate || order.createdAt || todayISO();
      const key = sourceDate.slice(0, 7);
      const current = map.get(key) || { month: key, total: 0, received: 0, pending: 0, orders: 0 };
      current.total += orderTotal(order);
      current.received += paidAmount(order);
      current.pending += balance(order);
      current.orders += 1;
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 6);
  }

  function v2Overview() {
    const orders = activeOrders();
    const customers = customerInsights();
    const children = childInsights().filter((item) => item.name !== "Não informado");
    const products = productInsights();
    const kits = kitInsights();
    const tasks = v2Tasks();
    const reports = monthlyReports();
    return `
      <div class="card v2-hero">
        <p class="eyebrow">Versão 2</p>
        <h3>Gestão inteligente com os dados que você já cadastrou</h3>
        <p class="muted">Clientes, crianças, produtos, kits, tarefas e relatórios agora nascem automaticamente a partir dos pedidos. Menos retrabalho, mais visão do ateliê.</p>
      </div>
      <div class="grid three">
        <div class="card summary-card"><span class="label">Clientes</span><span class="value">${customers.filter((item) => item.name !== "Não informado").length}</span><span class="muted">com pedidos cadastrados</span></div>
        <div class="card summary-card"><span class="label">Produtos</span><span class="value">${products.length}</span><span class="muted">itens vendidos</span></div>
        <div class="card summary-card"><span class="label">Tarefas</span><span class="value">${tasks.length}</span><span class="muted">pedem atenção</span></div>
      </div>
      <div class="grid two">
        <div class="card v2-card">
          <h3>Clientes</h3>
          <div class="insight-list">
            ${customers.length ? customers.slice(0, 6).map((customer) => `
              <div class="insight-row">
                <div><strong>${customer.name}</strong><span class="muted">${customer.phone || "Sem telefone"} · ${customer.orders.length} pedido(s)</span></div>
                <span class="metric">${money(customer.total)}</span>
              </div>
            `).join("") : `<p class="muted">Cadastre pedidos para montar sua lista de clientes automaticamente.</p>`}
          </div>
        </div>
        <div class="card v2-card">
          <h3>Crianças e temas</h3>
          <div class="insight-list">
            ${children.length ? children.slice(0, 6).map((child) => `
              <div class="insight-row">
                <div><strong>${child.name}</strong><span class="muted">${child.age ? `${child.age} anos · ` : ""}${child.themes.join(", ") || "Sem tema"}</span></div>
                <span class="metric">${child.orders.length} festa(s)</span>
              </div>
            `).join("") : `<p class="muted">Ao preencher nome da criança, idade e tema, esta área ganha vida sozinha.</p>`}
          </div>
        </div>
        <div class="card v2-card">
          <h3>Produtos mais vendidos</h3>
          <div class="insight-list">
            ${products.length ? products.slice(0, 8).map((product) => `
              <div class="insight-row">
                <div><strong>${product.name}</strong><span class="muted">${product.quantity} unidade(s) · ${product.orders} pedido(s)</span></div>
                <span class="metric">${money(product.total)}</span>
              </div>
            `).join("") : `<p class="muted">Os itens dos pedidos viram um ranking de produtos vendidos.</p>`}
          </div>
        </div>
        <div class="card v2-card">
          <h3>Kits sugeridos</h3>
          <div class="insight-list">
            ${kits.length ? kits.slice(0, 5).map((kit) => `
              <div class="insight-row">
                <div><strong>${kit.name}</strong><span class="muted">${kit.items.map(([name, qty]) => `${name} (${qty})`).join(", ")}</span></div>
                <span class="metric">${kit.orders.length} pedido(s)</span>
              </div>
            `).join("") : `<p class="muted">Quando houver temas repetidos, o app sugere kits com os itens mais usados.</p>`}
          </div>
        </div>
        <div class="card v2-card">
          <h3>Tarefas automáticas</h3>
          <div class="insight-list">
            ${tasks.length ? tasks.map(({ kind, order }) => `
              <div class="insight-row">
                <div><strong>${kind}</strong><span class="muted">${order.client || "Cliente"} · ${order.theme || "Sem tema"} · ${formatDate(order.deliveryDate)}</span></div>
                <button class="btn btn-secondary" data-open-order="${order.id}">Abrir</button>
              </div>
            `).join("") : `<p class="muted">Nenhuma pendência crítica agora.</p>`}
          </div>
        </div>
        <div class="card v2-card">
          <h3>Relatórios</h3>
          <div class="insight-list">
            ${reports.length ? reports.map((report) => `
              <div class="insight-row">
                <div><strong>${report.month.split("-").reverse().join("/")}</strong><span class="muted">${report.orders} pedido(s) · recebido ${money(report.received)} · pendente ${money(report.pending)}</span></div>
                <span class="metric">${money(report.total)}</span>
              </div>
            `).join("") : `<p class="muted">Quando houver pedidos, o app mostra vendas por mês automaticamente.</p>`}
          </div>
        </div>
      </div>
    `;
  }

  async function renderMore() {
    const frequency = await AtelieDB.getSetting("backupFrequency", "7");
    const lastBackupAt = await AtelieDB.getSetting("lastBackupAt");
    const snapshots = (await AtelieDB.getAll("snapshots")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
    const daysSinceBackup = lastBackupAt ? Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / 86400000) : null;
    const isOutdated = !lastBackupAt || (Number(frequency) && daysSinceBackup >= Number(frequency));
    const backupStatus = isOutdated ? "⚠ Backup desatualizado" : "✔ Backup atualizado";
    const backupStatusClass = isOutdated ? "backup-status warning" : "backup-status ok";
    $("#moreView").innerHTML = `
      <div class="card backup-alert">
        <h3>Aviso importante sobre backup</h3>
        <p>Para manter sua agenda segura, faça backup regularmente, principalmente antes de trocar de celular, limpar o navegador ou formatar o computador.</p>
        <p><strong>⚠ Se o navegador for apagado ou o aparelho for formatado sem existir um backup, os dados não poderão ser recuperados.</strong></p>
      </div>
      <div class="grid two">
        <div class="card backup-card">
          <span class="backup-number">1</span>
          <h3>Fazer Backup</h3>
          <p class="muted">Ao clicar no botão, o aplicativo gera um arquivo com todos os pedidos cadastrados. Salve esse arquivo onde preferir: Área de Trabalho, Documentos, Downloads, pendrive, HD externo, Google Drive, OneDrive, Dropbox, iCloud Drive ou outra pasta escolhida por você.</p>
          <p class="muted">O nome segue um padrão parecido com <strong>AtelieEmDia_Backup_2026-06-19.json</strong>, para facilitar encontrar a versão mais recente.</p>
          <button class="btn btn-primary full" data-backup>Salvar Backup Agora</button>
        </div>
        <div class="card backup-card">
          <span class="backup-number">2</span>
          <h3>Restaurar Backup</h3>
          <p class="muted">Ao selecionar um arquivo <strong>.json</strong>, o aplicativo abre o explorador de arquivos e restaura toda a agenda automaticamente.</p>
          <button class="btn btn-secondary full" data-restore>Selecionar Arquivo de Backup</button>
          <p class="small-note">Depois da restauração, você verá a mensagem: Backup restaurado com sucesso.</p>
        </div>
        <div class="card backup-card">
          <span class="backup-number">3</span>
          <h3>Frequência do lembrete</h3>
          <label>Quando lembrar de fazer backup?
            <select id="backupFrequency">
              <option value="0">Nunca lembrar</option>
              <option value="3">A cada 3 dias</option>
              <option value="7">Semanalmente</option>
              <option value="15">Quinzenalmente</option>
              <option value="30">Mensalmente</option>
            </select>
          </label>
          <p class="small-note">O app verifica a data do último backup e mostra um lembrete ao abrir quando chegar a hora.</p>
        </div>
        <div class="card backup-card">
          <span class="backup-number">4</span>
          <h3>Último Backup</h3>
          <p class="backup-date">${formatDateTime(lastBackupAt)}</p>
          <p class="${backupStatusClass}">${backupStatus}</p>
          ${isOutdated ? `<p class="small-note">Faz ${daysSinceBackup === null ? "algum tempo" : `${daysSinceBackup} dias`} que você não faz backup da sua agenda. Recomendamos atualizar seu backup para manter seus pedidos protegidos.</p><button class="btn btn-primary full" data-backup>Fazer Backup Agora</button>` : `<p class="small-note">Sua cópia externa está em dia com a frequência escolhida.</p>`}
        </div>
        <div class="card backup-card">
          <span class="backup-number">5</span>
          <h3>Onde meu backup fica salvo?</h3>
          <p class="muted">O aplicativo não envia seus dados para a internet. O arquivo de backup fica exatamente na pasta que você escolher durante o salvamento.</p>
          <p class="muted">Recomendamos guardar uma cópia em um serviço de armazenamento na nuvem, como Google Drive, OneDrive ou iCloud Drive, para maior segurança.</p>
        </div>
        <div class="card backup-card">
          <span class="backup-number">6</span>
          <h3>Troquei de celular. Como recuperar minha agenda?</h3>
          <ol class="steps">
            <li>Instale novamente o Ateliê em Dia.</li>
            <li>Abra o aplicativo.</li>
            <li>Acesse Backup.</li>
            <li>Clique em Restaurar Backup.</li>
            <li>Escolha o arquivo salvo anteriormente.</li>
            <li>Todos os pedidos voltarão automaticamente.</li>
          </ol>
        </div>
      </div>
      <div class="card backup-card">
        <span class="backup-number">7</span>
        <h3>Informações importantes</h3>
        <div class="notice-list">
          <p>✔ Os dados permanecem salvos no seu dispositivo.</p>
          <p>✔ O aplicativo funciona mesmo sem internet.</p>
          <p>✔ O backup protege sua agenda caso você troque de aparelho.</p>
          <p>✔ O backup pode ser armazenado onde você preferir.</p>
          <p>⚠ Se o navegador for apagado ou o aparelho for formatado sem existir um backup, os dados não poderão ser recuperados.</p>
        </div>
      </div>
      <div class="card backup-card">
        <h3>Histórico de backups locais</h3>
        <p class="muted">Além do arquivo externo, o app mantém automaticamente as 5 últimas versões da agenda neste dispositivo. Isso ajuda se um pedido for apagado por engano ou se uma alteração sair errada.</p>
        <div class="timeline">
          ${snapshots.length ? snapshots.map((snapshot) => `
            <div class="timeline-row">
              <strong>${formatDateTime(snapshot.createdAt)}</strong>
              <span class="muted">${snapshot.reason || "Versão salva"}</span>
              <button class="btn btn-secondary" data-restore-snapshot="${snapshot.id}">Restaurar esta versão</button>
            </div>
          `).join("") : `<p class="muted">Nenhuma versão local salva ainda. Ela será criada ao salvar pedidos, apagar dados ou fazer backup.</p>`}
        </div>
      </div>
    `;
    $("#backupFrequency").value = frequency;
    $("#backupFrequency").addEventListener("change", async (event) => {
      await AtelieDB.setSetting("backupFrequency", event.target.value);
      showToast("Preferência salva.");
      renderMore();
    });
  }

  function renderForm(order) {
    const editing = Boolean(order);
    const data = order || {
      items: [{ name: "", quantity: 1, unitPrice: 0 }],
      paymentStatus: "unpaid",
      depositPercent: "",
      paymentMethod: "",
      discountMode: "value",
      discountValue: 0,
      deliveryMethod: "",
      freightPayer: "client",
      freightValue: 0
    };
    state.editingId = editing ? order.id : null;
    $("#orderFormView").innerHTML = `
      <form id="orderForm" class="card">
        <div class="form-grid">
          <label>Nome da cliente<input name="client" value="${data.client || ""}" required></label>
          <label>Telefone<input name="phone" value="${data.phone || ""}" inputmode="tel"></label>
          <label>Nome da criança<input name="child" value="${data.child || ""}"></label>
          <label>Idade<input name="age" value="${data.age || ""}"></label>
          <label>Tema<input name="theme" value="${data.theme || ""}" required></label>
          <label>Data da festa<input name="partyDate" type="date" value="${data.partyDate || ""}"></label>
          <label>Data da entrega<input name="deliveryDate" type="date" value="${data.deliveryDate || todayISO()}" required></label>
        </div>
        <h3>Itens do pedido</h3>
        <div id="itemsBox" class="grid">${(data.items || []).map(itemFields).join("")}</div>
        <div class="actions item-actions">
          <button type="button" class="btn btn-secondary" data-add-item>Adicionar item</button>
        </div>
        <div class="form-grid sale-grid">
          <label>Forma de entrega
            <select name="deliveryMethod">
              <option value="" ${!data.deliveryMethod ? "selected" : ""}>Selecionar entrega</option>
              <option value="pickup" ${data.deliveryMethod === "pickup" ? "selected" : ""}>Retirada</option>
              <option value="carrier" ${data.deliveryMethod === "carrier" ? "selected" : ""}>Transportadora</option>
              <option value="post" ${data.deliveryMethod === "post" ? "selected" : ""}>Correios</option>
              <option value="motoboy" ${data.deliveryMethod === "motoboy" ? "selected" : ""}>Motoboy</option>
            </select>
          </label>
          <label>Frete pago por
            <select name="freightPayer">
              <option value="client" ${data.freightPayer !== "studio" ? "selected" : ""}>Cliente</option>
              <option value="studio" ${data.freightPayer === "studio" ? "selected" : ""}>Ateliê</option>
            </select>
          </label>
          <label class="span-2">Valor do frete<input name="freightValue" type="number" min="0" step="0.01" value="${data.freightValue || 0}"></label>
          <label>Forma de pagamento
            <select name="paymentMethod">
              <option value="" ${!data.paymentMethod ? "selected" : ""}>Selecionar forma</option>
              <option value="money" ${data.paymentMethod === "money" ? "selected" : ""}>Dinheiro</option>
              <option value="pix" ${data.paymentMethod === "pix" ? "selected" : ""}>Pix</option>
              <option value="operator" ${data.paymentMethod === "operator" ? "selected" : ""}>Operadoras de pagamento</option>
              <option value="shopee" ${data.paymentMethod === "shopee" ? "selected" : ""}>Shopee</option>
              <option value="mercado_livre" ${data.paymentMethod === "mercado_livre" ? "selected" : ""}>Mercado Livre</option>
              <option value="other" ${data.paymentMethod === "other" ? "selected" : ""}>Outros</option>
            </select>
          </label>
          <label>Desconto da venda
            <select name="discountMode">
              <option value="value" ${data.discountMode !== "percent" ? "selected" : ""}>Valor em R$</option>
              <option value="percent" ${data.discountMode === "percent" ? "selected" : ""}>Porcentagem %</option>
            </select>
          </label>
          <label class="span-2">Valor ou porcentagem do desconto<input name="discountValue" type="number" min="0" step="0.01" value="${data.discountValue || 0}"></label>
          <label>Status de pagamento
            <select name="paymentStatus">
              <option value="unpaid" ${data.paymentStatus === "unpaid" ? "selected" : ""}>Não pago</option>
              <option value="deposit" ${data.paymentStatus === "deposit" ? "selected" : ""}>Sinal pago</option>
              <option value="paid" ${data.paymentStatus === "paid" ? "selected" : ""}>Pago</option>
            </select>
          </label>
          <label>Porcentagem do sinal
            <select name="depositPercent">
              <option value="" ${!data.depositPercent ? "selected" : ""}>Escolher porcentagem</option>
              <option value="30" ${data.depositPercent === "30" ? "selected" : ""}>30%</option>
              <option value="40" ${data.depositPercent === "40" ? "selected" : ""}>40%</option>
              <option value="50" ${data.depositPercent === "50" ? "selected" : ""}>50%</option>
              <option value="100" ${data.depositPercent === "100" ? "selected" : ""}>100%</option>
              <option value="manual" ${data.depositPercent === "manual" ? "selected" : ""}>Valor manual</option>
            </select>
          </label>
          <label class="span-2">Valor do sinal<input name="deposit" type="number" min="0" step="0.01" value="${data.deposit || 0}"></label>
          <label class="span-2">Observações<textarea name="notes">${data.notes || ""}</textarea></label>
        </div>
        <div class="order-total">
          <div><span>Subtotal dos itens</span><strong id="orderFormSubtotal">${money(itemsSubtotal(data))}</strong></div>
          <div><span>Desconto</span><strong id="orderFormDiscount">${money(discountAmount(data))}</strong></div>
          <div><span>Frete cobrado</span><strong id="orderFormFreight">${money(freightCharged(data))}</strong></div>
          <div class="final-total"><span>Valor final recebido</span><strong id="orderFormTotal">${money(orderTotal(data))}</strong></div>
        </div>
        <div class="actions" style="margin-top: 14px;">
          <button type="submit" class="btn btn-primary">${editing ? "Salvar alterações" : "Salvar pedido"}</button>
        </div>
      </form>
    `;
    updateOrderFormTotal();
  }

  function updateOrderFormTotal() {
    const form = $("#orderForm");
    const totalBox = $("#orderFormTotal");
    if (!form || !totalBox) return;
    const subtotal = $$("#itemsBox .item-card").reduce((sum, card) => {
      const quantity = Number(card.querySelector('[name="itemQuantity"]').value || 0);
      const unitPrice = Number(card.querySelector('[name="itemPrice"]').value || 0);
      return sum + quantity * unitPrice;
    }, 0);
    const discountMode = form.elements.discountMode.value;
    const discountValue = Number(form.elements.discountValue.value || 0);
    const discount = discountMode === "percent" ? Math.min(subtotal, subtotal * discountValue / 100) : Math.min(subtotal, discountValue);
    const freight = form.elements.freightPayer.value === "client" ? Number(form.elements.freightValue.value || 0) : 0;
    const total = Math.max(0, subtotal - discount + freight);
    $("#orderFormSubtotal").textContent = money(subtotal);
    $("#orderFormDiscount").textContent = money(discount);
    $("#orderFormFreight").textContent = money(freight);
    totalBox.textContent = money(total);
    updateDepositFromPercent(total);
  }

  function updateDepositFromPercent(total = null) {
    const form = $("#orderForm");
    if (!form) return;
    const percent = form.elements.depositPercent && form.elements.depositPercent.value;
    const depositInput = form.elements.deposit;
    if (!depositInput || !percent || percent === "manual") return;
    const currentTotal = total ?? $$("#itemsBox .item-card").reduce((sum, card) => {
      const quantity = Number(card.querySelector('[name="itemQuantity"]').value || 0);
      const unitPrice = Number(card.querySelector('[name="itemPrice"]').value || 0);
      return sum + quantity * unitPrice;
    }, 0);
    depositInput.value = ((currentTotal * Number(percent)) / 100).toFixed(2);
  }

  function itemFields(item = {}) {
    return `
      <div class="item-card">
        <div class="form-grid">
          <label class="span-2">Nome do item<input name="itemName" value="${item.name || ""}" required></label>
          <label>Quantidade<input name="itemQuantity" type="number" min="1" step="1" value="${item.quantity || 1}" required></label>
          <label>Valor unitário<input name="itemPrice" type="number" min="0" step="0.01" value="${item.unitPrice || 0}" required></label>
        </div>
        <button type="button" class="btn btn-soft" data-remove-item>Excluir item</button>
      </div>
    `;
  }

  function checklistDocument(order) {
    const rows = ["Impressão", "Corte", "Montagem", "Embalagem"];
    const items = (order.items || []).map((item) => `
      <tr>
        <td>${escapeHtml(item.name || "Item")}</td>
        <td>${escapeHtml(item.quantity || 0)}</td>
        <td>${escapeHtml(money(Number(item.quantity || 0) * Number(item.unitPrice || 0)))}</td>
      </tr>
    `).join("");
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Checklist - ${escapeHtml(order.client || "Pedido")}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #222; margin: 28px; }
    .header { display: flex; align-items: center; gap: 16px; justify-content: flex-start; border-bottom: 2px solid #ff7bac; padding-bottom: 14px; margin-bottom: 18px; }
    .logo { width: 88px; height: 88px; object-fit: contain; }
    h1 { margin: 0 0 6px; font-size: 26px; }
    h2 { margin: 22px 0 10px; font-size: 18px; color: #8c38d6; }
    p { margin: 4px 0; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 18px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
    th, td { border: 1px solid #bbb; padding: 10px; text-align: left; vertical-align: top; }
    td:first-child { padding-left: 18px; }
    th { background: #fff0f6; }
    .check { width: 80px; height: 42px; }
    .notes { height: 74px; }
    @media print { body { margin: 12mm; } .no-print { display: none; } }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()">Imprimir</button>
  <section class="header">
    <img class="logo" src="assets/atelie-em-dia-logo-transparent.png" alt="Ateliê em Dia">
    <div>
      <h1>Checklist de PRODUÇÃO</h1>
      <p>${escapeHtml(order.client || "Cliente sem nome")} · ${escapeHtml(order.theme || "Sem tema")}</p>
    </div>
  </section>
  <h2>Dados da festa</h2>
  <section class="grid">
    <p><strong>Cliente:</strong> ${escapeHtml(order.client || "Não informado")}</p>
    <p><strong>Telefone:</strong> ${escapeHtml(order.phone || "Não informado")}</p>
    <p><strong>Criança:</strong> ${escapeHtml(order.child || "Não informado")}</p>
    <p><strong>Idade:</strong> ${escapeHtml(order.age || "Não informado")}</p>
    <p><strong>Tema:</strong> ${escapeHtml(order.theme || "Não informado")}</p>
    <p><strong>Data da festa:</strong> ${escapeHtml(formatDate(order.partyDate))}</p>
    <p><strong>Entrega:</strong> ${escapeHtml(formatDate(order.deliveryDate))}</p>
  </section>
  <h2>Itens vendidos</h2>
  <table>
    <thead><tr><th>Item</th><th>Quantidade</th><th>Valor</th></tr></thead>
    <tbody>${items || `<tr><td colspan="3">Nenhum item cadastrado.</td></tr>`}</tbody>
  </table>
  <h2>PRODUÇÃO</h2>
  <table>
    <thead><tr><th>Etapa</th><th>OK</th><th>Observação</th></tr></thead>
    <tbody>${rows.map((row) => `<tr><td>${row}</td><td class="check"></td><td class="notes"></td></tr>`).join("")}</tbody>
  </table>
</body>
</html>`;
  }

  function downloadChecklist(order) {
    const html = checklistDocument(order);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Checklist_${safeFileName(order.client)}_${safeFileName(order.theme)}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function checklistPdfBytes(order) {
    const rows = ["Impressão", "Corte", "Montagem", "Embalagem"];
    const lines = [];
    let y = 800;

    function text(x, size, value, font = "F1") {
      lines.push(`BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
      y -= size + 7;
    }

    function rule() {
      lines.push(`0.9 0.48 0.68 RG 50 ${y} m 545 ${y} l S`);
      y -= 16;
    }

    function cell(x, width, height, value, bold = false) {
      lines.push(`0 0 0 RG ${x} ${y - height + 8} ${width} ${height} re S`);
      const font = bold ? "F2" : "F1";
      const content = wrapPdfText(value, Math.max(8, Math.floor(width / 6.2))).slice(0, 2);
      let lineY = y - 12;
      for (const item of content) {
        lines.push(`BT /${font} 9 Tf ${x + 5} ${lineY} Td (${pdfEscape(item)}) Tj ET`);
        lineY -= 11;
      }
    }

    lines.push("0.9 0.48 0.68 rg 50 770 46 46 re f");
    lines.push("0.49 1 0.81 rg 76 792 14 14 re f");
    lines.push("0 0 0 rg");
    lines.push("BT /F2 14 Tf 106 798 Td (Atelie) Tj ET");
    lines.push("BT /F2 14 Tf 106 780 Td (em Dia) Tj ET");
    y = 744;
    text(50, 22, "Checklist de PRODUÇÃO", "F2");
    text(50, 12, `${order.client || "Cliente sem nome"} - ${order.theme || "Sem tema"}`);
    rule();
    text(50, 14, "Dados da festa", "F2");
    const dataRows = [
      ["Cliente", order.client || "Nao informado"],
      ["Telefone", order.phone || "Nao informado"],
      ["Crianca", order.child || "Nao informado"],
      ["Idade", order.age || "Nao informado"],
      ["Tema", order.theme || "Nao informado"],
      ["Data da festa", formatDate(order.partyDate)],
      ["Entrega", formatDate(order.deliveryDate)]
    ];
    for (let index = 0; index < dataRows.length; index += 2) {
      const left = dataRows[index];
      const right = dataRows[index + 1];
      cell(50, 245, 28, `${left[0]}: ${left[1]}`);
      if (right) cell(300, 245, 28, `${right[0]}: ${right[1]}`);
      y -= 28;
    }
    y -= 8;
    text(50, 14, "Itens vendidos", "F2");
    cell(50, 300, 26, "Item", true);
    cell(350, 80, 26, "Qtd.", true);
    cell(430, 115, 26, "Valor", true);
    y -= 26;
    const items = order.items && order.items.length ? order.items : [{ name: "Nenhum item cadastrado", quantity: "", unitPrice: 0 }];
    for (const item of items.slice(0, 12)) {
      cell(50, 300, 28, item.name || "Item");
      cell(350, 80, 28, item.quantity || "");
      cell(430, 115, 28, item.quantity ? money(Number(item.quantity || 0) * Number(item.unitPrice || 0)) : "");
      y -= 28;
    }
    y -= 8;
    text(50, 14, "PRODUÇÃO", "F2");
    cell(50, 180, 28, "Etapa", true);
    cell(230, 70, 28, "OK", true);
    cell(300, 245, 28, "Observacao", true);
    y -= 28;
    for (const row of rows) {
      cell(50, 180, 42, row);
      cell(230, 70, 42, "");
      cell(300, 245, 42, "");
      y -= 42;
    }

    const stream = lines.join("\n");
    const objects = [
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
      "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
      "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj",
      "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
      "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj",
      `6 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (const object of objects) {
      offsets.push(pdf.length);
      pdf += `${object}\n`;
    }
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index < offsets.length; index++) {
      pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Uint8Array(Array.from(pdf).map((char) => char.charCodeAt(0)));
  }

  function downloadChecklistPdf(order) {
    const blob = new Blob([checklistPdfBytes(order)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const filename = `Checklist_${safeFileName(order.client)}_${safeFileName(order.theme)}.pdf`;
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return { url, filename };
  }

  function showChecklistPdfLinks(order) {
    const box = $("#checklistDownloadBox");
    if (!box) return;
    const { url, filename } = downloadChecklistPdf(order);
    box.classList.remove("hidden");
    box.innerHTML = `
      <strong>PDF gerado</strong>
      <p class="muted">Se o download não abrir sozinho, use um dos botões abaixo.</p>
      <div class="actions">
        <a class="btn btn-primary" href="${url}" download="${filename}">Baixar PDF</a>
        <a class="btn btn-secondary" href="${url}" target="_blank" rel="noopener">Abrir PDF</a>
      </div>
    `;
  }

  function renderDetail(order) {
    if (!order) return setScreen("orders");
    const [label, cls] = status(order);
    const paymentLabels = { money: "Dinheiro", pix: "Pix", operator: "Operadoras de pagamento", shopee: "Shopee", mercado_livre: "Mercado Livre", other: "Outros" };
    const deliveryLabels = { pickup: "Retirada", carrier: "Transportadora", post: "Correios", motoboy: "Motoboy" };
    const checklistRows = ["Impressão", "Corte", "Montagem", "Embalagem"];
    $("#orderDetailView").innerHTML = `
      <div class="card">
        <div class="section-head">
          <div><h3>${order.client}</h3><p class="muted">${order.theme || "Sem tema"} · entrega ${formatDate(order.deliveryDate)}</p></div>
          <span class="chip ${cls}">${label}</span>
        </div>
        <div class="grid two">
          <div><span class="muted">Subtotal</span><strong>${money(itemsSubtotal(order))}</strong></div>
          <div><span class="muted">Desconto</span><strong>${money(discountAmount(order))}</strong></div>
          <div><span class="muted">Frete cobrado</span><strong>${money(freightCharged(order))}</strong></div>
          <div><span class="muted">Total</span><strong>${money(orderTotal(order))}</strong></div>
          <div><span class="muted">Saldo</span><strong>${money(balance(order))}</strong></div>
          <div><span class="muted">Fase da produção</span><strong>${phaseLabels[order.productionPhase || (order.done ? "finished" : "send_art")]}</strong></div>
          <div><span class="muted">Pagamento</span><strong>${optionLabel(order.paymentMethod, paymentLabels)}</strong></div>
          <div><span class="muted">Entrega</span><strong>${optionLabel(order.deliveryMethod, deliveryLabels)}</strong></div>
          <div><span class="muted">Frete pago por</span><strong>${order.freightPayer === "studio" ? "Ateliê" : "Cliente"}</strong></div>
          <div><span class="muted">Telefone</span><strong>${order.phone || "Não informado"}</strong></div>
          <div><span class="muted">Criança</span><strong>${order.child || "Não informado"}</strong></div>
        </div>
        <p class="muted" style="margin-top: 14px;">${order.notes || "Sem observações."}</p>
        <div class="actions">
          <button class="btn btn-primary" data-edit-order="${order.id}">Editar</button>
          <button class="btn btn-success" data-complete-order="${order.id}">Concluir</button>
          <button class="btn btn-secondary" data-generate-checklist-pdf="${order.id}">Gerar PDF</button>
          <button class="btn btn-secondary" data-print-checklist="${order.id}">Imprimir</button>
          <button class="btn btn-danger" data-trash-order="${order.id}">Excluir</button>
        </div>
      </div>
      <div class="card"><h3>Itens</h3><div class="task-list">${(order.items || []).map((item) => `<div class="task"><strong>${item.quantity} × ${item.name}</strong><span class="muted">${money(Number(item.quantity) * Number(item.unitPrice))}</span></div>`).join("")}</div></div>
      <div class="card print-card">
        <div class="section-head">
          <h3>Checklist de PRODUÇÃO</h3>
          <button class="btn btn-secondary" data-generate-checklist-pdf="${order.id}">Gerar PDF</button>
          <button class="btn btn-secondary" data-generate-checklist="${order.id}">Gerar HTML</button>
          <button class="btn btn-secondary" data-print-checklist="${order.id}">Imprimir</button>
        </div>
        <div id="checklistDownloadBox" class="download-box hidden"></div>
        <div class="print-checklist" id="printChecklist">
          <div class="checklist-header">
            <img src="assets/atelie-em-dia-logo-transparent.png" alt="">
            <div>
              <h2>Checklist de PRODUÇÃO</h2>
              <p>${order.client || "Cliente sem nome"} · ${order.theme || "Sem tema"}</p>
            </div>
          </div>
          <div class="checklist-grid">
            <p><strong>Cliente:</strong> ${order.client || "Não informado"}</p>
            <p><strong>Telefone:</strong> ${order.phone || "Não informado"}</p>
            <p><strong>Criança:</strong> ${order.child || "Não informado"}</p>
            <p><strong>Idade:</strong> ${order.age || "Não informado"}</p>
            <p><strong>Tema:</strong> ${order.theme || "Não informado"}</p>
            <p><strong>Data da festa:</strong> ${formatDate(order.partyDate)}</p>
            <p><strong>Entrega:</strong> ${formatDate(order.deliveryDate)}</p>
          </div>
          <h3>Itens vendidos</h3>
          <table>
            <thead><tr><th>Item</th><th>Quantidade</th><th>Valor</th></tr></thead>
            <tbody>${(order.items || []).map((item) => `<tr><td>${item.name || "Item"}</td><td>${item.quantity || 0}</td><td>${money(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</td></tr>`).join("")}</tbody>
          </table>
          <h3>PRODUÇÃO</h3>
          <table>
            <thead><tr><th>Etapa</th><th>OK</th><th>Observação</th></tr></thead>
            <tbody>${checklistRows.map((row) => `<tr><td>${row}</td><td class="check-cell"></td><td></td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>
      <div class="card"><h3>Histórico</h3><div class="timeline">${(order.history || []).map((event) => `<div class="timeline-row"><strong>${event.text}</strong><span class="muted">${new Date(event.at).toLocaleString("pt-BR")}</span></div>`).join("") || "<p class='muted'>Nenhum histórico registrado.</p>"}</div></div>
    `;
  }

  function render() {
    if ($("#app").classList.contains("hidden")) return;
    if (state.currentView === "day") renderDay();
    if (state.currentView === "clients") renderClients();
    if (state.currentView === "agenda") renderAgenda();
    if (state.currentView === "orders") renderOrders();
    if (state.currentView === "production") renderProduction();
    if (state.currentView === "dashboard") renderDashboard();
    if (state.currentView === "more") renderMore();
  }

  function collectOrder(form) {
    const formData = new FormData(form);
    const itemCards = $$("#itemsBox .item-card");
    const items = itemCards.map((card) => ({
      name: card.querySelector('[name="itemName"]').value.trim(),
      quantity: Number(card.querySelector('[name="itemQuantity"]').value || 0),
      unitPrice: Number(card.querySelector('[name="itemPrice"]').value || 0)
    })).filter((item) => item.name);
    const existing = state.orders.find((order) => order.id === state.editingId);
    const order = existing ? { ...existing } : { id: crypto.randomUUID(), createdAt: new Date().toISOString(), history: [] };
    Object.assign(order, {
      client: formData.get("client").trim(),
      phone: formData.get("phone").trim(),
      child: formData.get("child").trim(),
      age: formData.get("age").trim(),
      theme: formData.get("theme").trim(),
      partyDate: formData.get("partyDate"),
      deliveryDate: formData.get("deliveryDate"),
      paymentMethod: formData.get("paymentMethod"),
      discountMode: formData.get("discountMode"),
      discountValue: Number(formData.get("discountValue") || 0),
      deliveryMethod: formData.get("deliveryMethod"),
      freightPayer: formData.get("freightPayer"),
      freightValue: Number(formData.get("freightValue") || 0),
      paymentStatus: formData.get("paymentStatus"),
      depositPercent: formData.get("depositPercent"),
      deposit: Number(formData.get("deposit") || 0),
      notes: formData.get("notes").trim(),
      items,
      updatedAt: new Date().toISOString()
    });
    addHistory(order, existing ? "Pedido atualizado." : "Pedido criado.");
    return order;
  }

  async function maybeShowBackupReminder() {
    const frequency = Number(await AtelieDB.getSetting("backupFrequency", "7"));
    if (!frequency) return;
    const lastBackupAt = await AtelieDB.getSetting("lastBackupAt");
    const due = !lastBackupAt || (Date.now() - new Date(lastBackupAt).getTime()) / 86400000 >= frequency;
    $("#backupReminder").classList.toggle("hidden", !due);
  }

  async function doBackup() {
    await AtelieBackup.exportBackup();
    $("#backupReminder").classList.add("hidden");
    if (state.currentView === "more") renderMore();
    showToast("Backup realizado.");
  }

  async function restoreBackup(file) {
    if (!file) return;
    const ok = confirm("Restaurar este backup substituirá os dados atuais da sua agenda. Deseja continuar?");
    if (!ok) return;
    try {
      await AtelieBackup.importBackup(file);
      await loadOrders();
      await loadClients();
      render();
      showToast("Backup restaurado com sucesso.");
    } catch (error) {
      showToast(error.message || "Não foi possível restaurar o backup.");
    }
  }

  async function restoreLocalSnapshot(id) {
    const snapshot = await AtelieDB.get("snapshots", id);
    if (!snapshot) return showToast("Versão local não encontrada.");
    const ok = confirm("Restaurar esta versão local substituirá a agenda atual. Deseja continuar?");
    if (!ok) return;
    await AtelieDB.snapshot("Antes de restaurar versão local");
    await AtelieDB.clear("orders");
    await AtelieDB.clear("clients");
    await AtelieDB.clear("settings");
    for (const order of snapshot.data.orders || []) await AtelieDB.put("orders", order);
    for (const client of snapshot.data.clients || []) await AtelieDB.put("clients", client);
    for (const setting of snapshot.data.settings || []) await AtelieDB.put("settings", setting);
    await loadOrders();
    await loadClients();
    render();
    showToast("Versão local restaurada com sucesso.");
  }

  document.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.id === "startBtn") {
      await AtelieDB.setSetting("welcomed", true);
      return showAuth("create");
    }
    if (target.dataset.view) return setScreen(target.dataset.view);
    if (target.id === "moreBtn") return setScreen("more");
    if (target.id === "fabNewOrder" || target.dataset.newOrder !== undefined) {
      renderForm();
      return setScreen("form");
    }
    if (target.dataset.newClient !== undefined) return renderClientForm();
    if (target.dataset.editClient) return renderClientForm(state.clients.find((client) => client.id === target.dataset.editClient));
    if (target.dataset.cancelClient !== undefined) {
      state.editingClientId = null;
      $("#clientFormBox").classList.add("hidden");
      return;
    }
    if (target.dataset.addItem !== undefined) {
      $("#itemsBox").insertAdjacentHTML("beforeend", itemFields());
      updateOrderFormTotal();
      return;
    }
    if (target.dataset.removeItem !== undefined) {
      target.closest(".item-card").remove();
      updateOrderFormTotal();
      return;
    }
    if (target.dataset.openOrder) {
      const order = state.orders.find((item) => item.id === target.dataset.openOrder);
      renderDetail(order);
      return setScreen("detail");
    }
    if (target.dataset.editOrder) {
      renderForm(state.orders.find((item) => item.id === target.dataset.editOrder));
      return setScreen("form");
    }
    if (target.dataset.completeOrder) {
      const order = state.orders.find((item) => item.id === target.dataset.completeOrder);
      order.done = true;
      order.productionPhase = "finished";
      addHistory(order, "Status alterado para concluído.");
      await saveOrder(order, "Concluir pedido");
      showToast("Produção concluída.");
      return;
    }
    if (target.dataset.printChecklist) {
      window.print();
      return;
    }
    if (target.dataset.generateChecklist) {
      const order = state.orders.find((item) => item.id === target.dataset.generateChecklist);
      if (!order) return showToast("Pedido não encontrado.");
      downloadChecklist(order);
      return showToast("Checklist gerado.");
    }
    if (target.dataset.generateChecklistPdf) {
      const order = state.orders.find((item) => item.id === target.dataset.generateChecklistPdf);
      if (!order) return showToast("Pedido não encontrado.");
      showChecklistPdfLinks(order);
      return showToast("PDF do checklist gerado.");
    }
    if (target.dataset.trashOrder) {
      const ok = confirm("Tem certeza? O pedido irá para a lixeira por 30 dias.");
      if (!ok) return;
      const order = state.orders.find((item) => item.id === target.dataset.trashOrder);
      order.deletedAt = new Date().toISOString();
      addHistory(order, "Pedido enviado para a lixeira.");
      await saveOrder(order, "Excluir pedido");
      showToast("Pedido enviado para a lixeira.");
      return setScreen("orders");
    }
    if (target.dataset.day) return showDayOrders(target.dataset.day);
    if (target.dataset.backup !== undefined || target.id === "reminderBackupBtn") return doBackup();
    if (target.dataset.restore !== undefined) return $("#restoreFile").click();
    if (target.dataset.restoreSnapshot) return restoreLocalSnapshot(target.dataset.restoreSnapshot);
    if (target.id === "dismissReminderBtn") return $("#backupReminder").classList.add("hidden");
    if (target.dataset.changePassword !== undefined) {
      const current = prompt("Digite sua senha atual:");
      const stored = await AtelieDB.getSetting("passwordHash");
      if (!current || await hash(current) !== stored) return showToast("Senha atual incorreta.");
      const next = prompt("Digite a nova senha:");
      if (!next) return;
      await AtelieDB.setSetting("passwordHash", await hash(next));
      return showToast("Senha alterada com sucesso.");
    }
    if (target.dataset.deleteAll !== undefined) {
      const ok = confirm("Apagar todos os pedidos e configurações deste dispositivo?");
      if (!ok) return;
      await AtelieDB.snapshot("Antes de apagar dados");
      await AtelieDB.clear("orders");
      await loadOrders();
      render();
      return showToast("Dados apagados.");
    }
  });

  $("#createPasswordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const pass = $("#newPassword").value;
    const confirmPass = $("#confirmPassword").value;
    if (!pass || pass !== confirmPass) return showToast("As senhas precisam ser iguais.");
    await AtelieDB.setSetting("passwordHash", await hash(pass));
    await AtelieDB.setSetting("backupFrequency", "7");
    await enterApp();
  });

  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const stored = await AtelieDB.getSetting("passwordHash");
    const password = $("#loginPassword").value;
    if (await hash(password) !== stored) return showToast("Senha incorreta.");
    setRememberedPassword($("#rememberPassword").checked ? password : "");
    await enterApp();
  });

  document.addEventListener("submit", async (event) => {
    if (event.target.id === "clientForm") {
      event.preventDefault();
      const formData = new FormData(event.target);
      const existing = state.clients.find((client) => client.id === state.editingClientId);
      const client = existing ? { ...existing } : { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      Object.assign(client, {
        personType: formData.get("personType"),
        document: formData.get("document").trim(),
        whatsapp: formData.get("whatsapp").trim(),
        name: formData.get("name").trim(),
        lastName: formData.get("lastName").trim(),
        birthDate: formData.get("birthDate"),
        zip: formData.get("zip").trim(),
        street: formData.get("street").trim(),
        number: formData.get("number").trim(),
        complement: formData.get("complement").trim(),
        neighborhood: formData.get("neighborhood").trim(),
        state: formData.get("state").trim(),
        city: formData.get("city").trim(),
        notes: formData.get("notes").trim(),
        updatedAt: new Date().toISOString()
      });
      await AtelieDB.put("clients", client);
      await loadClients();
      state.editingClientId = null;
      renderClients();
      return showToast("Cliente salvo.");
    }
    if (event.target.id !== "orderForm") return;
    event.preventDefault();
    const order = collectOrder(event.target);
    if (!order.items.length) return showToast("Adicione pelo menos um item.");
    await saveOrder(order, state.editingId ? "Editar pedido" : "Criar pedido");
    showToast(state.editingId ? "Pedido atualizado." : "Pedido salvo.");
    renderDetail(order);
    setScreen("detail");
  });

  document.addEventListener("input", (event) => {
    if (!event.target.closest("#orderForm")) return;
    if (["itemQuantity", "itemPrice", "discountValue", "freightValue"].includes(event.target.name)) updateOrderFormTotal();
    if (event.target.name === "deposit") {
      const percent = event.target.form.elements.depositPercent;
      if (percent) percent.value = "manual";
    }
  });

  document.addEventListener("change", async (event) => {
    if (event.target.dataset.phaseOrder) {
      const order = state.orders.find((item) => item.id === event.target.dataset.phaseOrder);
      if (!order) return;
      order.productionPhase = event.target.value;
      order.done = event.target.value === "finished";
      addHistory(order, `Fase alterada para ${phaseLabels[event.target.value]}.`);
      await saveOrder(order, "Alterar fase do pedido");
      showToast("Fase do pedido atualizada.");
      return;
    }
    if (!event.target.closest("#orderForm")) return;
    if (event.target.name === "depositPercent") updateOrderFormTotal();
    if (["discountMode", "freightPayer", "deliveryMethod"].includes(event.target.name)) updateOrderFormTotal();
  });

  $("#restoreFile").addEventListener("change", (event) => restoreBackup(event.target.files[0]));

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js"));
  }

  checkAuth();
})();
