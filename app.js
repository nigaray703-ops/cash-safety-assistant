/*
Legacy script disabled by the simplified personal cash dashboard refactor.
The new implementation starts after this comment block.

const STORAGE_KEY = "cash-safety-web-v1";

const defaultLabels = {
  currentSavings: "当前存款",
  rent: "房租",
  utilities: "水电网预计",
  familySupport: "家庭支持",
  salary: "工资",
  extraIncome: "额外收入",
  productPrice: "商品价格"
};

const defaultCards = [
  { id: "cash", type: "cash", icon: "盾", title: "当前现金", items: [] },
  { id: "monthly", type: "monthly", icon: "月", title: "本月预计结余", items: [] },
  { id: "fixed", type: "fixed", icon: "支", title: "固定支出", items: [] },
  { id: "income", type: "income", icon: "收", title: "收入", items: [] },
  { id: "time", type: "time", icon: "时", title: "钱换时间", items: [] }
];

const defaults = {
  currentSavings: 9000,
  safetyLine: 3000,
  rent: 1400,
  utilities: 250,
  familySupport: 0,
  salary: 0,
  extraIncome: 0,
  grossHourlyRate: 35,
  manualNetHourlyRate: 0,
  usesManualNetHourlyRate: false,
  dailyWorkHours: 8,
  weeklyWorkDays: 5,
  showsTimeValueCard: true,
  showsMonthlyBalanceCard: true,
  productPrice: 0,
  labels: defaultLabels,
  cards: defaultCards,
  records: []
};

let state = loadState();

const pairedFields = {
  currentSavings: ["settingsCurrentSavings"],
  rent: ["settingsRent"],
  utilities: ["settingsUtilities"],
  familySupport: ["settingsFamilySupport"],
  salary: ["settingsSalary"],
  extraIncome: ["settingsExtraIncome"]
};

const singleFields = [
  "safetyLine",
  "productPrice",
  "grossHourlyRate",
  "manualNetHourlyRate",
  "dailyWorkHours",
  "weeklyWorkDays"
];

const labelFields = {
  labelCurrentSavings: "currentSavings",
  labelRent: "rent",
  labelUtilities: "utilities",
  labelFamilySupport: "familySupport",
  labelSalary: "salary",
  labelExtraIncome: "extraIncome",
  labelProductPrice: "productPrice"
};

function loadState() {
  try {
    return normalizeState({ ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") });
  } catch {
    return normalizeState({ ...defaults });
  }
}

function normalizeState(nextState) {
  const savedCards = Array.isArray(nextState.cards) ? nextState.cards : [];
  const mergedCards = defaultCards.map((card) => {
    const savedCard = savedCards.find((item) => item.id === card.id);
    return {
      ...card,
      ...savedCard,
      items: Array.isArray(savedCard?.items) ? savedCard.items : []
    };
  });
  const customCards = savedCards.filter((card) => !defaultCards.some((item) => item.id === card.id));
  return {
    ...nextState,
    labels: { ...defaultLabels, ...(nextState.labels || {}) },
    cards: [...mergedCards, ...customCards].map((card) => ({ ...card, items: card.items || [] })),
    records: Array.isArray(nextState.records) ? nextState.records : []
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Date.now().toString(36)}`;
}

function numberValue(value) {
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function currency(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2
  }).format(value || 0);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function setInput(id, value) {
  const input = document.getElementById(id);
  if (input && document.activeElement !== input) {
    input.value = value || value === 0 ? String(value) : "";
  }
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function bindAmountInput(id, key) {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener("input", () => {
    state[key] = numberValue(input.value);
    saveState();
    render();
  });
}

function bindCheckbox(id, key) {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener("change", () => {
    state[key] = input.checked;
    saveState();
    render();
  });
}

function safetyStatus() {
  if (state.currentSavings <= state.safetyLine) return "紧张";
  if (state.currentSavings <= state.safetyLine * 1.8) return "注意";
  return "安全";
}

function cardById(cardId) {
  return state.cards.find((card) => card.id === cardId);
}

function itemById(card, itemId) {
  return card?.items.find((item) => item.id === itemId);
}

function customItemsTotal(cardType) {
  return state.cards
    .filter((card) => card.type === cardType && !card.deleted)
    .flatMap((card) => card.items)
    .reduce((sum, item) => sum + numberValue(item.amount), 0);
}

function incomeTotal() {
  return state.familySupport + state.salary + state.extraIncome + customItemsTotal("income");
}

function fixedExpenseTotal() {
  return state.rent + state.utilities + customItemsTotal("fixed");
}

function netHourlyRate() {
  if (state.usesManualNetHourlyRate && state.manualNetHourlyRate > 0) {
    return state.manualNetHourlyRate;
  }
  return state.grossHourlyRate * 0.82;
}

function workTimeText(amount) {
  const hourly = netHourlyRate();
  if (!amount || hourly <= 0) return "0 分钟";
  const hours = amount / hourly;
  const totalMinutes = Math.max(1, Math.round(hours * 60));
  if (totalMinutes < 60) return `${totalMinutes} 分钟`;
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourText = `${wholeHours} 小时 ${minutes} 分钟`;
  if (hours > 40) {
    const weeklyHours = Math.max(1, state.dailyWorkHours) * Math.max(1, state.weeklyWorkDays);
    return `${hourText}，约 ${formatOneDecimal(hours / weeklyHours)} 个工作周`;
  }
  if (hours > 8) return `${hourText}，约 ${formatOneDecimal(hours / Math.max(1, state.dailyWorkHours))} 个工作日`;
  return hourText;
}

function formatOneDecimal(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function currentMonthRecords() {
  const now = new Date();
  return state.records.filter((record) => {
    const date = new Date(record.date);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
}

function cardHeader(card) {
  return `
    <div class="card-title">
      <span class="icon">${escapeHtml(card.icon || "项")}</span>
      <span class="card-heading">${escapeHtml(card.title)}</span>
    </div>
  `;
}

function moneyRow(label, value) {
  return `
    <div class="metric-row">
      <span>${escapeHtml(label)}</span>
      <strong>${currency(value)}</strong>
    </div>
  `;
}

function textRow(label, value) {
  return `
    <div class="metric-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function homeCustomItemRows(card) {
  return card.items.map((item) => `
    ${moneyRow(item.label, numberValue(item.amount))}
  `).join("");
}

function renderCardBody(card) {
  if (card.type === "cash") {
    return `
      <div class="cash-row">
        <div class="field-block">
          <span>${escapeHtml(state.labels.currentSavings)}</span>
          <strong class="hero-value">${currency(state.currentSavings)}</strong>
        </div>
        <span class="status-pill">${safetyStatus()}</span>
      </div>
      ${homeCustomItemRows(card)}
    `;
  }

  if (card.type === "monthly") {
    return `
      ${moneyRow("收入合计", incomeTotal())}
      ${moneyRow("固定支出合计", fixedExpenseTotal())}
      <div class="divider"></div>
      ${moneyRow("预计结余", incomeTotal() - fixedExpenseTotal())}
      ${homeCustomItemRows(card)}
    `;
  }

  if (card.type === "fixed") {
    return `
      ${moneyRow(state.labels.rent, state.rent)}
      ${moneyRow(state.labels.utilities, state.utilities)}
      ${homeCustomItemRows(card)}
      <div class="divider"></div>
      ${moneyRow("合计", fixedExpenseTotal())}
    `;
  }

  if (card.type === "income") {
    return `
      ${moneyRow(state.labels.familySupport, state.familySupport)}
      ${moneyRow(state.labels.salary, state.salary)}
      ${moneyRow(state.labels.extraIncome, state.extraIncome)}
      ${homeCustomItemRows(card)}
      <div class="divider"></div>
      ${moneyRow("合计", incomeTotal())}
    `;
  }

  if (card.type === "time") {
    return `
      ${moneyRow(state.labels.productPrice, state.productPrice)}
      ${homeCustomItemRows(card)}
      <p class="time-result">${workTimeText(state.productPrice)}</p>
    `;
  }

  const total = card.items.reduce((sum, item) => sum + numberValue(item.amount), 0);
  return `
    ${homeCustomItemRows(card)}
    <div class="divider"></div>
    ${moneyRow("合计", total)}
  `;
}

function shouldShowCard(card) {
  if (card.deleted) return false;
  if (card.type === "monthly" && !state.showsMonthlyBalanceCard) return false;
  if (card.type === "time" && !state.showsTimeValueCard) return false;
  return true;
}

function renderHomeCards() {
  const container = document.getElementById("homeCards");
  if (!container) return;
  const cards = state.cards.filter(shouldShowCard);
  container.innerHTML = cards.map((card) => `
    <article class="glass-card" data-card-id="${card.id}">
      ${cardHeader(card)}
      ${renderCardBody(card)}
    </article>
  `).join("");
}

function renderRecords() {
  const list = document.getElementById("recordList");
  const recent = [...state.records].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
  if (!recent.length) {
    list.innerHTML = '<p class="empty">暂无记录</p>';
    return;
  }

  list.innerHTML = recent.map((record) => `
    <div class="record-item">
      <div>
        <strong>${currency(record.amount)}</strong><br />
        <small>${new Date(record.date).toLocaleDateString()}</small>
      </div>
      <div class="record-actions">
        <button class="mini-button" data-edit="${record.id}" type="button">编辑</button>
        <button class="mini-button" data-delete="${record.id}" type="button">删除</button>
      </div>
    </div>
  `).join("");
}

function render() {
  Object.entries(pairedFields).forEach(([key, ids]) => ids.forEach((id) => setInput(id, state[key])));
  singleFields.forEach((key) => setInput(key, state[key]));
  Object.entries(labelFields).forEach(([id, key]) => setInput(id, state.labels[key]));

  document.getElementById("usesManualNetHourlyRate").checked = state.usesManualNetHourlyRate;
  document.getElementById("showsTimeValueCard").checked = state.showsTimeValueCard;
  document.getElementById("showsMonthlyBalanceCard").checked = state.showsMonthlyBalanceCard;

  const monthRecords = currentMonthRecords();
  const monthExpense = fixedExpenseTotal() + monthRecords.reduce((sum, record) => sum + record.amount, 0);
  setText("summaryIncome", currency(incomeTotal()));
  setText("summaryExpense", currency(monthExpense));
  setText("summarySavings", currency(state.currentSavings));

  renderHomeCards();
  renderRecords();
}

function setupSettingsEditing() {
  Object.entries(labelFields).forEach(([id, key]) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("input", () => {
      state.labels[key] = input.value;
      saveState();
      renderHomeCards();
    });
  });
}

function setup() {
  Object.entries(pairedFields).forEach(([key, ids]) => ids.forEach((id) => bindAmountInput(id, key)));
  singleFields.forEach((key) => bindAmountInput(key, key));
  bindCheckbox("usesManualNetHourlyRate", "usesManualNetHourlyRate");
  bindCheckbox("showsTimeValueCard", "showsTimeValueCard");
  bindCheckbox("showsMonthlyBalanceCard", "showsMonthlyBalanceCard");

  setupSettingsEditing();

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
      document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(button.dataset.tab).classList.add("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  document.getElementById("expenseForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const amountInput = document.getElementById("expenseAmount");
    const amount = numberValue(amountInput.value);
    if (amount <= 0) return;
    state.currentSavings -= amount;
    state.records.unshift({ id: uid("record"), amount, date: new Date().toISOString() });
    amountInput.value = "";
    saveState();
    render();
  });

  document.getElementById("recordList").addEventListener("click", (event) => {
    const editId = event.target.dataset.edit;
    const deleteId = event.target.dataset.delete;
    if (editId) {
      const record = state.records.find((item) => item.id === editId);
      if (!record) return;
      const next = prompt("修改扣费金额", String(record.amount));
      if (next === null) return;
      const nextAmount = numberValue(next);
      if (nextAmount <= 0) return;
      state.currentSavings += record.amount;
      record.amount = nextAmount;
      state.currentSavings -= nextAmount;
      saveState();
      render();
    }
    if (deleteId) {
      const record = state.records.find((item) => item.id === deleteId);
      if (!record) return;
      const restore = confirm("删除这条记录？点确定会恢复这笔余额。");
      state.records = state.records.filter((item) => item.id !== deleteId);
      if (restore) state.currentSavings += record.amount;
      saveState();
      render();
    }
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }

  render();
}

setup();
*/

const STORAGE_KEY = "cash-safety-web-v2";
const LEGACY_STORAGE_KEY = "cash-safety-web-v1";
const ACTIVE_TAB_KEY = "cash-safety-active-tab";

const defaults = {
  currentSavings: 9000,
  safetyLine: 3000,
  familySupport: 0,
  salary: 0,
  extraIncome: 0,
  rent: 1400,
  utilitiesInternet: 250,
  netHourlyWage: 28.42,
  dailyWorkHours: 8,
  weeklyWorkDays: 5,
  showTimeCard: true,
  records: [],
  productPrice: 0
};

let state = loadState();
let recordType = "expense";
let toastTimer = null;

function loadState() {
  const saved = readStorage(STORAGE_KEY);
  if (saved) return normalizeState(saved);

  const legacy = readStorage(LEGACY_STORAGE_KEY);
  if (legacy) {
    return normalizeState({
      ...defaults,
      currentSavings: legacy.currentSavings,
      safetyLine: legacy.safetyLine,
      familySupport: legacy.familySupport,
      salary: legacy.salary,
      extraIncome: legacy.extraIncome,
      rent: legacy.rent,
      utilitiesInternet: legacy.utilities,
      netHourlyWage: legacy.manualNetHourlyRate || (legacy.grossHourlyRate ? legacy.grossHourlyRate * 0.82 : defaults.netHourlyWage),
      dailyWorkHours: legacy.dailyWorkHours,
      weeklyWorkDays: legacy.weeklyWorkDays,
      showTimeCard: legacy.showsTimeValueCard !== false,
      productPrice: legacy.productPrice,
      records: Array.isArray(legacy.records)
        ? legacy.records.map((record) => ({
            id: record.id || uid("record"),
            type: record.type || "expense",
            amount: numberValue(record.amount),
            name: record.name || "支出",
            date: record.date || new Date().toISOString(),
            createdAt: record.createdAt || record.date || new Date().toISOString()
          }))
        : []
    });
  }

  return normalizeState(defaults);
}

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function normalizeState(raw) {
  const next = { ...defaults, ...(raw || {}) };
  return {
    ...next,
    currentSavings: numberValue(next.currentSavings),
    safetyLine: numberValue(next.safetyLine),
    familySupport: numberValue(next.familySupport),
    salary: numberValue(next.salary),
    extraIncome: numberValue(next.extraIncome),
    rent: numberValue(next.rent),
    utilitiesInternet: numberValue(next.utilitiesInternet),
    netHourlyWage: numberValue(next.netHourlyWage) || defaults.netHourlyWage,
    dailyWorkHours: numberValue(next.dailyWorkHours) || defaults.dailyWorkHours,
    weeklyWorkDays: numberValue(next.weeklyWorkDays) || defaults.weeklyWorkDays,
    showTimeCard: next.showTimeCard !== false,
    productPrice: numberValue(next.productPrice),
    records: Array.isArray(next.records) ? next.records.map(normalizeRecord).filter(Boolean) : []
  };
}

function normalizeRecord(record) {
  const amount = numberValue(record?.amount);
  if (amount <= 0) return null;
  return {
    id: record.id || uid("record"),
    type: record.type === "income" ? "income" : "expense",
    amount,
    name: record.name || (record.type === "income" ? "收入" : "支出"),
    date: record.date || new Date().toISOString(),
    createdAt: record.createdAt || record.date || new Date().toISOString()
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix) {
  const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

function numberValue(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function currency(value, options = {}) {
  const amount = numberValue(value);
  const sign = amount < 0 ? "-" : options.plus && amount > 0 ? "+" : "";
  return `${sign}NZ$${Math.abs(amount).toLocaleString("en-NZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function incomeTotal() {
  return state.familySupport + state.salary + state.extraIncome;
}

function fixedExpenseTotal() {
  return state.rent + state.utilitiesInternet;
}

function monthlyBalance() {
  return incomeTotal() - fixedExpenseTotal();
}

function buffer() {
  return state.currentSavings - state.safetyLine;
}

function cashStatus() {
  if (state.currentSavings <= state.safetyLine) {
    return { label: "紧张", className: "status-danger" };
  }
  if (state.currentSavings <= state.safetyLine * 1.8) {
    return { label: "注意", className: "status-warning" };
  }
  return { label: "安全", className: "status-safe" };
}

function amountTone(value) {
  if (value > 0) return "amount-positive";
  if (value < 0) return "amount-negative";
  return "amount-zero";
}

function moneyLine(label, value, className = "") {
  return `
    <div class="money-line ${className}">
      <span>${escapeHtml(label)}</span>
      <strong>${currency(value)}</strong>
    </div>
  `;
}

function renderHome() {
  const container = document.getElementById("homeCards");
  if (!container) return;
  const status = cashStatus();
  const balance = monthlyBalance();
  container.innerHTML = `
    <article class="glass-card">
      <div class="card-topline">
        <h2>当前现金</h2>
        <span class="status-pill ${status.className}">${status.label}</span>
      </div>
      <strong class="main-amount">${currency(state.currentSavings)}</strong>
    </article>

    <article class="glass-card">
      <h2>本月预计结余</h2>
      <strong class="main-amount ${amountTone(balance)}">${currency(balance)}</strong>
      ${moneyLine("收入合计", incomeTotal())}
      ${moneyLine("固定支出合计", fixedExpenseTotal())}
    </article>

    <article class="glass-card">
      <h2>固定收支</h2>
      <div class="section-heading">收入</div>
      ${moneyLine("家庭支持", state.familySupport)}
      ${moneyLine("工资", state.salary)}
      ${moneyLine("额外收入", state.extraIncome)}
      ${moneyLine("收入合计", incomeTotal(), "total")}
      <div class="divider"></div>
      <div class="section-heading">支出</div>
      ${moneyLine("房租", state.rent)}
      ${moneyLine("水电网预计", state.utilitiesInternet)}
      ${moneyLine("固定支出合计", fixedExpenseTotal(), "total")}
    </article>

    ${state.showTimeCard ? renderTimeCard() : ""}
  `;

  const productInput = document.getElementById("productPriceInput");
  if (productInput) {
    productInput.addEventListener("input", () => {
      state.productPrice = numberValue(productInput.value);
      saveState();
      renderTimeResult();
    });
    renderTimeResult();
  }
}

function renderTimeCard() {
  return `
    <article class="glass-card">
      <h2>钱换时间</h2>
      <label class="time-input-row" for="productPriceInput">
        <span class="field-label">商品价格</span>
        <span class="money-input">
          <span>NZ$</span>
          <input class="amount-input" id="productPriceInput" inputmode="decimal" placeholder="0.00" value="${state.productPrice || ""}" />
        </span>
      </label>
      <div class="time-result-block">
        <span class="time-label">需要工作</span>
        <strong class="time-value" id="workTimePrimary">0 分钟</strong>
        <span class="time-extra" id="workTimeExtra"></span>
      </div>
      <p class="card-note" id="timeCardNote"></p>
    </article>
  `;
}

function renderTimeResult() {
  const primary = document.getElementById("workTimePrimary");
  const extra = document.getElementById("workTimeExtra");
  const note = document.getElementById("timeCardNote");
  if (!primary || !extra || !note) return;

  const result = workTimeText(state.productPrice);
  primary.textContent = result.primary;
  extra.textContent = result.extra;
  note.textContent = `按税后时薪 ${currency(state.netHourlyWage)}/hr 计算`;
}

function workTimeText(price) {
  const amount = numberValue(price);
  const hourly = numberValue(state.netHourlyWage);
  if (amount <= 0 || hourly <= 0) return { primary: "0 分钟", extra: "" };

  const hours = amount / hourly;
  const minutes = hours * 60;
  let primary = "";
  if (minutes < 1) {
    primary = "< 1 分钟";
  } else if (minutes < 60) {
    primary = `${Math.round(minutes)} 分钟`;
  } else {
    const wholeHours = Math.floor(minutes / 60);
    const restMinutes = Math.round(minutes % 60);
    primary = `${wholeHours}h ${restMinutes}m`;
  }

  const dayHours = Math.max(1, numberValue(state.dailyWorkHours));
  const weekHours = dayHours * Math.max(1, numberValue(state.weeklyWorkDays));
  let extra = "";
  if (hours >= weekHours) {
    extra = `约 ${(hours / weekHours).toFixed(1)} 个工作周`;
  } else if (hours >= dayHours) {
    extra = `约 ${(hours / dayHours).toFixed(1)} 个工作日`;
  }
  return { primary, extra };
}

function renderRecords() {
  const list = document.getElementById("recordList");
  if (!list) return;
  const recent = [...state.records]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);

  if (!recent.length) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 4h8l2 3v13H6V7z"/>
          <path d="M8 10h8"/>
          <path d="M8 14h6"/>
        </svg>
        <strong>暂无记录</strong>
        <p>开始记录你的第一笔收支</p>
      </div>
    `;
    return;
  }

  list.innerHTML = recent.map((record) => {
    const isIncome = record.type === "income";
    return `
      <div class="record-row">
        <div class="record-main">
          <span class="record-date">${formatRecordDate(record.date)}</span>
          <span class="record-name">${escapeHtml(record.name)}</span>
        </div>
        <strong class="record-amount ${isIncome ? "amount-positive" : "amount-negative"}">${currency(record.amount, { plus: isIncome })}</strong>
        <button class="delete-button" data-delete-record="${record.id}" type="button" aria-label="删除记录">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16"/>
            <path d="M10 11v6"/>
            <path d="M14 11v6"/>
            <path d="M6 7l1 14h10l1-14"/>
            <path d="M9 7V4h6v3"/>
          </svg>
        </button>
      </div>
    `;
  }).join("");
}

function formatRecordDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function setInput(id, value) {
  const input = document.getElementById(id);
  if (input && document.activeElement !== input) input.value = String(value ?? "");
}

function renderSettings() {
  setInput("settingsCurrentSavings", state.currentSavings);
  setInput("settingsFamilySupport", state.familySupport);
  setInput("settingsSalary", state.salary);
  setInput("settingsExtraIncome", state.extraIncome);
  setInput("settingsRent", state.rent);
  setInput("settingsUtilities", state.utilitiesInternet);
  setInput("netHourlyWage", state.netHourlyWage);
  setInput("dailyWorkHours", state.dailyWorkHours);
  setInput("weeklyWorkDays", state.weeklyWorkDays);
  const showTimeCard = document.getElementById("showTimeCard");
  if (showTimeCard) showTimeCard.checked = state.showTimeCard;
}

function render() {
  renderHome();
  renderRecords();
  renderSettings();
}

function bindAmount(id, key) {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener("input", () => {
    state[key] = numberValue(input.value);
    saveState();
    renderHome();
  });
}

function setRecordType(type) {
  recordType = type === "income" ? "income" : "expense";
  document.querySelectorAll("[data-record-type]").forEach((button) => {
    button.classList.toggle("active", button.dataset.recordType === recordType);
  });
  const submit = document.getElementById("recordSubmit");
  if (submit) submit.textContent = recordType === "income" ? "保存收入" : "保存支出";
}

function activateTab(tabId, options = {}) {
  const targetId = document.getElementById(tabId) ? tabId : "home-screen";
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === targetId);
  });
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.toggle("active", screen.id === targetId);
  });
  localStorage.setItem(ACTIVE_TAB_KEY, targetId);
  if (options.scroll !== false) window.scrollTo({ top: 0, behavior: options.smooth ? "smooth" : "auto" });
}

function showSavedToast(message = "已保存。") {
  const toast = document.getElementById("saveToast");
  if (!toast) return;
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.textContent = "";
  }, 1600);
}

function setup() {
  bindAmount("settingsCurrentSavings", "currentSavings");
  bindAmount("settingsFamilySupport", "familySupport");
  bindAmount("settingsSalary", "salary");
  bindAmount("settingsExtraIncome", "extraIncome");
  bindAmount("settingsRent", "rent");
  bindAmount("settingsUtilities", "utilitiesInternet");
  bindAmount("netHourlyWage", "netHourlyWage");
  bindAmount("dailyWorkHours", "dailyWorkHours");
  bindAmount("weeklyWorkDays", "weeklyWorkDays");

  const showTimeCard = document.getElementById("showTimeCard");
  if (showTimeCard) {
    showTimeCard.addEventListener("change", () => {
      state.showTimeCard = showTimeCard.checked;
      saveState();
      renderHome();
    });
  }

  document.querySelectorAll("[data-record-type]").forEach((button) => {
    button.addEventListener("click", () => setRecordType(button.dataset.recordType));
  });

  const form = document.getElementById("recordForm");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const amountInput = document.getElementById("recordAmount");
      const nameInput = document.getElementById("recordName");
      const amount = numberValue(amountInput?.value);
      if (amount <= 0) return;

      const now = new Date().toISOString();
      const record = {
        id: uid("record"),
        type: recordType,
        amount,
        name: nameInput?.value.trim() || (recordType === "income" ? "收入" : "支出"),
        date: now,
        createdAt: now
      };

      state.currentSavings += recordType === "income" ? amount : -amount;
      state.records.unshift(record);
      amountInput.value = "";
      if (nameInput) nameInput.value = "";
      saveState();
      showSavedToast();
      render();
    });
  }

  const list = document.getElementById("recordList");
  if (list) {
    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-delete-record]");
      if (!button) return;
      const id = button.dataset.deleteRecord;
      const record = state.records.find((item) => item.id === id);
      if (!record) return;
      if (!confirm("删除这条记录？\n删除后会自动恢复当前现金。")) return;

      state.currentSavings += record.type === "income" ? -record.amount : record.amount;
      state.records = state.records.filter((item) => item.id !== id);
      saveState();
      render();
    });
  }

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.tab, { smooth: true });
    });
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }

  setRecordType("expense");
  render();
  activateTab(localStorage.getItem(ACTIVE_TAB_KEY) || "home-screen", { scroll: false });
}

setup();
