import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const DEMO_STORAGE_KEY = "cash-safety-demo-v1";
const LEGACY_STORAGE_KEY = "cash-safety-web-v2";
const ACTIVE_TAB_KEY = "cash-safety-active-tab";

const demoData = {
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
  productPrice: 0,
  records: []
};

let state = loadDemoState();
let recordType = "expense";
let toastTimer = null;
let auth = null;
let db = null;
let currentUser = null;
let authReady = false;
let cloudReady = false;

function firebaseConfig() {
  return window.CASH_SAFETY_FIREBASE_CONFIG || {};
}

function hasFirebaseConfig() {
  const config = firebaseConfig();
  return Boolean(
    config.apiKey &&
    config.authDomain &&
    config.projectId &&
    !String(config.apiKey).includes("REPLACE_WITH") &&
    !String(config.projectId).includes("REPLACE_WITH")
  );
}

function loadDemoState() {
  const saved = readStorage(DEMO_STORAGE_KEY) || readStorage(LEGACY_STORAGE_KEY);
  return normalizeState(saved || demoData);
}

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeDemoState() {
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
}

function profilePayload() {
  return {
    currentSavings: state.currentSavings,
    safetyLine: state.safetyLine,
    familySupport: state.familySupport,
    salary: state.salary,
    extraIncome: state.extraIncome,
    rent: state.rent,
    utilitiesInternet: state.utilitiesInternet,
    netHourlyWage: state.netHourlyWage,
    dailyWorkHours: state.dailyWorkHours,
    weeklyWorkDays: state.weeklyWorkDays,
    showTimeCard: state.showTimeCard,
    updatedAt: serverTimestamp()
  };
}

function normalizeState(raw) {
  const next = { ...demoData, ...(raw || {}) };
  return {
    ...next,
    currentSavings: numberValue(next.currentSavings),
    safetyLine: numberValue(next.safetyLine),
    familySupport: numberValue(next.familySupport),
    salary: numberValue(next.salary),
    extraIncome: numberValue(next.extraIncome),
    rent: numberValue(next.rent),
    utilitiesInternet: numberValue(next.utilitiesInternet),
    netHourlyWage: numberValue(next.netHourlyWage) || demoData.netHourlyWage,
    dailyWorkHours: numberValue(next.dailyWorkHours) || demoData.dailyWorkHours,
    weeklyWorkDays: numberValue(next.weeklyWorkDays) || demoData.weeklyWorkDays,
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

async function saveProfile() {
  if (!currentUser || !db) {
    writeDemoState();
    return;
  }
  await setDoc(doc(db, "users", currentUser.uid, "profile", "main"), profilePayload(), { merge: true });
}

async function loadCloudState(user) {
  const profileRef = doc(db, "users", user.uid, "profile", "main");
  const profileSnap = await getDoc(profileRef);
  const recordsQuery = query(collection(db, "users", user.uid, "records"), orderBy("createdAt", "desc"), limit(50));
  const recordsSnap = await getDocs(recordsQuery);
  const records = recordsSnap.docs.map((recordDoc) => normalizeRecord({ id: recordDoc.id, ...recordDoc.data() })).filter(Boolean);

  if (profileSnap.exists()) {
    state = normalizeState({ ...profileSnap.data(), records });
  } else {
    state = normalizeState({ ...demoData, records: [] });
    await setDoc(profileRef, profilePayload());
  }
}

async function saveRecord(record) {
  if (!currentUser || !db) return;
  await setDoc(doc(db, "users", currentUser.uid, "records", record.id), record);
}

async function removeRecord(recordId) {
  if (!currentUser || !db) return;
  await deleteDoc(doc(db, "users", currentUser.uid, "records", recordId));
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
  if (state.currentSavings <= state.safetyLine) return { label: "紧张", className: "status-danger" };
  if (state.currentSavings <= state.safetyLine * 1.8) return { label: "注意", className: "status-warning" };
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
      ${moneyLine("安全线", state.safetyLine)}
      ${moneyLine("可用缓冲", buffer(), "total")}
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
      <div class="divider"></div>
      <div class="section-heading">支出</div>
      ${moneyLine("房租", state.rent)}
      ${moneyLine("水电网预计", state.utilitiesInternet)}
    </article>

    ${state.showTimeCard ? renderTimeCard() : ""}
  `;

  const productInput = document.getElementById("productPriceInput");
  if (productInput) {
    productInput.addEventListener("input", () => {
      state.productPrice = numberValue(productInput.value);
      writeDemoState();
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
  if (minutes < 1) primary = "< 1 分钟";
  else if (minutes < 60) primary = `${Math.round(minutes)} 分钟`;
  else primary = `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
  const dayHours = Math.max(1, numberValue(state.dailyWorkHours));
  const weekHours = dayHours * Math.max(1, numberValue(state.weeklyWorkDays));
  let extra = "";
  if (hours >= weekHours) extra = `约 ${(hours / weekHours).toFixed(1)} 个工作周`;
  else if (hours >= dayHours) extra = `约 ${(hours / dayHours).toFixed(1)} 个工作日`;
  return { primary, extra };
}

function renderRecords() {
  const list = document.getElementById("recordList");
  if (!list) return;
  const recent = [...state.records].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);
  if (!recent.length) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 4h8l2 3v13H6V7z"/><path d="M8 10h8"/><path d="M8 14h6"/>
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
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/></svg>
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
  setInput("settingsSafetyLine", state.safetyLine);
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

function renderAuth() {
  const signedOut = document.getElementById("signedOutActions");
  const signedIn = document.getElementById("signedInPanel");
  const email = document.getElementById("currentUserEmail");
  const notice = document.getElementById("modeNotice");
  if (signedOut) signedOut.hidden = Boolean(currentUser);
  if (signedIn) signedIn.hidden = !currentUser;
  if (email) email.textContent = currentUser?.email || "未登录";
  if (notice) {
    notice.textContent = currentUser
      ? "已登录。你的数据会保存到 Firestore 当前账号下。"
      : "当前为 Demo 模式。数据只保存在本机浏览器，登录后可同步保存你的私人数据。";
  }
}

function render() {
  renderAuth();
  renderHome();
  renderRecords();
  renderSettings();
}

function setAuthStatus(message, isError = false) {
  const status = document.getElementById("authStatus");
  if (!status) return;
  status.textContent = message || "";
  status.classList.toggle("amount-negative", Boolean(isError));
}

function friendlyAuthError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (message.includes("auth/email-already-in-use")) return "这个邮箱已经注册过，请直接登录。";
  if (message.includes("auth/invalid-email")) return "邮箱格式不正确。";
  if (message.includes("auth/weak-password")) return "密码至少需要 6 位。";
  if (message.includes("auth/invalid-credential") || message.includes("auth/wrong-password")) return "邮箱或密码不正确。";
  if (message.includes("auth/configuration-not-found")) return "Firebase 邮箱密码登录还没有开启。";
  if (message.includes("permission-denied")) return "Firestore 权限规则未配置，请检查 README 里的 Security Rules。";
  return error?.message || "操作失败，请稍后再试。";
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.hidden = false;
}

function closeModals() {
  document.querySelectorAll(".modal-backdrop").forEach((modal) => { modal.hidden = true; });
}

async function bindAmount(id, key) {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener("input", async () => {
    state[key] = numberValue(input.value);
    renderHome();
    try {
      await saveProfile();
    } catch (error) {
      setAuthStatus(friendlyAuthError(error), true);
    }
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
  toastTimer = setTimeout(() => { toast.textContent = ""; }, 1600);
}

async function setupFirebase() {
  if (!hasFirebaseConfig()) {
    authReady = true;
    cloudReady = false;
    setAuthStatus("Demo 可用。配置 Firebase 后可注册登录。", false);
    render();
    return;
  }
  const app = initializeApp(firebaseConfig());
  auth = getAuth(app);
  db = getFirestore(app);
  cloudReady = true;
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user) {
      state = loadDemoState();
      authReady = true;
      setAuthStatus("");
      render();
      return;
    }
    setAuthStatus("正在读取你的私人数据...");
    try {
      await loadCloudState(user);
      authReady = true;
      setAuthStatus("");
      render();
      activateTab(localStorage.getItem(ACTIVE_TAB_KEY) || "home-screen", { scroll: false });
    } catch (error) {
      setAuthStatus(friendlyAuthError(error), true);
      authReady = true;
      render();
    }
  });
}

function setupAuthUi() {
  document.getElementById("openSignInButton")?.addEventListener("click", () => openModal("signInModal"));
  document.getElementById("openSignUpButton")?.addEventListener("click", () => openModal("signUpModal"));
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModals));
  document.querySelectorAll(".modal-backdrop").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModals();
    });
  });

  document.getElementById("signInForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!auth) return setAuthStatus("请先配置 Firebase。", true);
    const email = document.getElementById("signInEmail")?.value.trim();
    const password = document.getElementById("signInPassword")?.value;
    if (!email || !password) return setAuthStatus("请输入邮箱和密码。", true);
    setAuthStatus("正在登录...");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      closeModals();
    } catch (error) {
      setAuthStatus(friendlyAuthError(error), true);
    }
  });

  document.getElementById("signUpForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!auth) return setAuthStatus("请先配置 Firebase。", true);
    const email = document.getElementById("signUpEmail")?.value.trim();
    const password = document.getElementById("signUpPassword")?.value;
    const confirm = document.getElementById("signUpPasswordConfirm")?.value;
    if (!email || !password || !confirm) return setAuthStatus("请完整填写注册信息。", true);
    if (password.length < 6) return setAuthStatus("密码至少需要 6 位。", true);
    if (password !== confirm) return setAuthStatus("两次密码不一致。", true);
    setAuthStatus("正在注册...");
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      closeModals();
    } catch (error) {
      setAuthStatus(friendlyAuthError(error), true);
    }
  });

  document.getElementById("signOutButton")?.addEventListener("click", async () => {
    if (!auth) return;
    await signOut(auth);
    currentUser = null;
    state = loadDemoState();
    render();
  });
}

function setup() {
  bindAmount("settingsCurrentSavings", "currentSavings");
  bindAmount("settingsSafetyLine", "safetyLine");
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
    showTimeCard.addEventListener("change", async () => {
      state.showTimeCard = showTimeCard.checked;
      renderHome();
      try { await saveProfile(); } catch (error) { setAuthStatus(friendlyAuthError(error), true); }
    });
  }

  document.querySelectorAll("[data-record-type]").forEach((button) => {
    button.addEventListener("click", () => setRecordType(button.dataset.recordType));
  });

  document.getElementById("recordForm")?.addEventListener("submit", async (event) => {
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
    try {
      if (currentUser) {
        await saveRecord(record);
        await saveProfile();
      } else {
        writeDemoState();
      }
      showSavedToast(currentUser ? "已保存到云端。" : "Demo 数据已保存在本机。");
    } catch (error) {
      setAuthStatus(friendlyAuthError(error), true);
    }
    render();
  });

  document.getElementById("recordList")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-record]");
    if (!button) return;
    const id = button.dataset.deleteRecord;
    const record = state.records.find((item) => item.id === id);
    if (!record) return;
    if (!confirm("删除这条记录？\n删除后会自动恢复当前现金。")) return;
    state.currentSavings += record.type === "income" ? -record.amount : record.amount;
    state.records = state.records.filter((item) => item.id !== id);
    try {
      if (currentUser) {
        await removeRecord(id);
        await saveProfile();
      } else {
        writeDemoState();
      }
    } catch (error) {
      setAuthStatus(friendlyAuthError(error), true);
    }
    render();
  });

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab, { smooth: true }));
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }

  setupAuthUi();
  setRecordType("expense");
  render();
  setupFirebase();
  activateTab(localStorage.getItem(ACTIVE_TAB_KEY) || "home-screen", { scroll: false });
}

setup();
