const STORAGE_KEY = "cash-safety-web-v2";
const LEGACY_STORAGE_KEY = "cash-safety-web-v1";
const ACTIVE_TAB_KEY = "cash-safety-active-tab";
const CLOUD_TABLE = "cash_safety_profiles";
const supabaseSettings = window.CASH_SAFETY_SUPABASE || {};
const hasSupabaseConfig = Boolean(supabaseSettings.url && supabaseSettings.anonKey && !String(supabaseSettings.url).includes("YOUR_") && !String(supabaseSettings.anonKey).includes("YOUR_"));
let supabaseClient = null;
let currentUser = null;

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

let state = loadLocalState();
let recordType = "expense";
let toastTimer = null;

function loadLocalState() {
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

async function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!supabaseClient || !currentUser) return;
  await supabaseClient.from(CLOUD_TABLE).upsert({ user_id: currentUser.id, data: state, updated_at: new Date().toISOString() });
}

async function loadCloudState() {
  if (!supabaseClient || !currentUser) return;
  const { data, error } = await supabaseClient.from(CLOUD_TABLE).select("data").eq("user_id", currentUser.id).maybeSingle();
  if (error) { setAuthStatus("云端数据读取失败，请检查 Supabase 表和权限。", true); return; }
  if (data && data.data) state = normalizeState(data.data);
  else await saveState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setLocked(locked) {
  document.body.classList.toggle("locked", locked);
  document.body.classList.toggle("authenticated", !locked);
}

function setAuthStatus(message, isError = false) {
  const status = document.getElementById("authStatus");
  if (!status) return;
  status.textContent = message || "";
  status.classList.toggle("amount-negative", Boolean(isError));
}

function updateAccountUi() {
  const accountEmail = document.getElementById("accountEmail");
  if (accountEmail) accountEmail.textContent = currentUser?.email || "未登录";
}

async function handleAuthChange(user) {
  currentUser = user || null;
  updateAccountUi();
  if (!currentUser) { state = normalizeState(defaults); setLocked(true); render(); return; }
  setAuthStatus("正在读取你的私人数据...");
  await loadCloudState();
  setLocked(false);
  setAuthStatus("");
  render();
  activateTab(localStorage.getItem(ACTIVE_TAB_KEY) || "home-screen", { scroll: false });
}

async function setupAuth() {
  setLocked(true);
  if (!hasSupabaseConfig || !window.supabase) { setAuthStatus("登录功能已加入，但还需要配置 Supabase 地址和 anon key。", true); render(); return; }
  supabaseClient = window.supabase.createClient(supabaseSettings.url, supabaseSettings.anonKey);
  const { data } = await supabaseClient.auth.getSession();
  await handleAuthChange(data.session?.user || null);
  supabaseClient.auth.onAuthStateChange((_event, session) => handleAuthChange(session?.user || null));
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
  const authForm = document.getElementById("authForm");
  const signUpButton = document.getElementById("signUpButton");
  const signOutButton = document.getElementById("signOutButton");
  if (authForm) authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabaseClient) return;
    const email = document.getElementById("authEmail")?.value.trim();
    const password = document.getElementById("authPassword")?.value;
    if (!email || !password) return setAuthStatus("请输入邮箱和密码。", true);
    setAuthStatus("正在登录...");
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) setAuthStatus(error.message, true);
  });
  if (signUpButton) signUpButton.addEventListener("click", async () => {
    if (!supabaseClient) return;
    const email = document.getElementById("authEmail")?.value.trim();
    const password = document.getElementById("authPassword")?.value;
    if (!email || !password) return setAuthStatus("请输入邮箱和密码。", true);
    setAuthStatus("正在注册...");
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) setAuthStatus(error.message, true);
    else setAuthStatus("注册成功。如果收到确认邮件，请先点邮件里的确认链接。");
  });
  if (signOutButton) signOutButton.addEventListener("click", async () => { if (supabaseClient) await supabaseClient.auth.signOut(); });

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
}

setup();
setupAuth();
