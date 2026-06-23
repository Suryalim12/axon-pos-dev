const state = {
  products: [],
  members: [],
  selectedMember: null,
  cart: [],
  memberMatches: [],
  cashiers: [],
  cashierMatches: [],
  types: ["STUDENT", "TUTOR", "STAF", "ALUMNI", "TETANGGA", "ONLINE", "STRANGER"],
  typeMatches: [],
  payments: ["Cash", "GoFood", "GrabFood", "Ovo", "QR GoMerch", "QR Midtrans"],
  paymentMatches: [],
  activeCategory: "All Menu",
};

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);
const today = () => localDateKey(new Date());
const config = window.AXON_POS_CONFIG || {};
const MIDTRANS_PAYMENT_LINK = "https://app.midtrans.com/payment-links/INV-AXON-COFFEE-y5ghgTh0";
const PAYMENT_STORAGE_KEY = "axonPosPayments";
const DEFAULT_PAYMENTS = ["Cash", "GoFood", "GrabFood", "Ovo", "QR GoMerch", "QR Midtrans"];
let toastTimer;
let cancelQrisWait = null;

async function api(path, options = {}) {
  if (!config.APPS_SCRIPT_URL) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const body = await res.json();
    if (body.error) throw new Error(body.error);
    if (!res.ok) throw new Error("Request failed");
    return body;
  }

  let url = config.APPS_SCRIPT_URL;
  const request = { ...options };

  if (path === "/api/bootstrap") {
    const params = new URLSearchParams({ action: "bootstrap", token: config.API_TOKEN || "" });
    url = `${url}?${params.toString()}`;
  } else {
    const payload = JSON.parse(options.body || "{}");
    payload.token = config.API_TOKEN || "";
    if (path.includes("members")) payload.action = "members";
    else if (path.includes("midtrans-qris")) payload.action = "midtransQris";
    else if (path.includes("midtrans-status")) payload.action = "midtransStatus";
    else payload.action = "transactions";
    request.method = "POST";
    request.body = JSON.stringify(payload);
  }

  const res = await fetch(url, request);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  if (!res.ok) throw new Error("Request failed");
  return body;
}

function renderSummary(summary) {
  const latest = summary.latestDate ? new Date(summary.latestDate).toLocaleDateString("id-ID") : "no date yet";
  $("syncState").textContent = `Synced with Master Data - AXON.xlsx - latest sale ${latest}`;
}

function renderCampaigns(campaigns) {
  $("campaignList").innerHTML = campaigns.map((item) => `
    <div class="campaign">
      <strong>${escapeHtml(item.campaign)}</strong>
      <span>${escapeHtml(item.reward)}</span>
    </div>
  `).join("") || "<p>No campaigns yet</p>";
}

function renderOptions(id, values) {
  const select = $(id);
  if (select.tagName === "SELECT") {
    select.innerHTML = values.map((value) => `<option>${escapeHtml(value)}</option>`).join("");
    return;
  }
  select.value = "";
}

function renderCashierDropdown() {
  const dropdown = $("cashierDropdown");
  const rawQuery = $("cashier").value.trim().toUpperCase();
  const query = rawQuery.toLowerCase();
  state.cashierMatches = state.cashiers
    .filter((cashier) => cashier.toLowerCase().includes(query))
    .slice(0, 7);
  const createText = rawQuery ? `Add new cashier "${rawQuery}"` : "Add new cashier";
  dropdown.innerHTML = `
    <button type="button" class="searchOption create" data-create-cashier>
      <strong>${escapeHtml(createText)}</strong>
      <small>Use this cashier name</small>
    </button>
    ${state.cashierMatches.map((cashier, index) => `
      <button type="button" class="searchOption" data-pick-cashier="${index}">
        <strong>${escapeHtml(cashier)}</strong>
      </button>
    `).join("")}
  `;
  dropdown.hidden = false;
  dropdown.querySelector("[data-create-cashier]").onclick = () => selectCashier(rawQuery);
  dropdown.querySelectorAll("[data-pick-cashier]").forEach((button) => {
    button.onclick = () => selectCashier(state.cashierMatches[button.dataset.pickCashier]);
  });
}

function selectCashier(name) {
  if (!name) return;
  name = name.trim().toUpperCase();
  $("cashier").value = name;
  if (!state.cashiers.some((cashier) => cashier.toLowerCase() === name.toLowerCase())) {
    state.cashiers.unshift(name);
  }
  hideCashierDropdown();
}

function hideCashierDropdown() {
  $("cashierDropdown").hidden = true;
}

function renderTypeDropdown() {
  const dropdown = $("typeDropdown");
  const rawQuery = $("customerType").value.trim().toUpperCase();
  const query = rawQuery.toLowerCase();
  state.typeMatches = state.types
    .filter((type) => type.toLowerCase().includes(query))
    .slice(0, 7);
  const createText = rawQuery ? `Add new type "${rawQuery}"` : "Add new type";
  dropdown.innerHTML = `
    <button type="button" class="searchOption create" data-create-type>
      <strong>${escapeHtml(createText)}</strong>
      <small>Use this customer type</small>
    </button>
    ${state.typeMatches.map((type, index) => `
      <button type="button" class="searchOption" data-pick-type="${index}">
        <strong>${escapeHtml(type)}</strong>
      </button>
    `).join("")}
  `;
  dropdown.hidden = false;
  dropdown.querySelector("[data-create-type]").onclick = () => selectType(rawQuery);
  dropdown.querySelectorAll("[data-pick-type]").forEach((button) => {
    button.onclick = () => selectType(state.typeMatches[button.dataset.pickType]);
  });
}

function selectType(name) {
  if (!name) return;
  name = name.trim().toUpperCase();
  $("customerType").value = name;
  if (!state.types.some((type) => type.toLowerCase() === name.toLowerCase())) {
    state.types.unshift(name);
  }
  hideTypeDropdown();
}

function hideTypeDropdown() {
  $("typeDropdown").hidden = true;
}

function renderPaymentDropdown() {
  const dropdown = $("paymentDropdown");
  const rawQuery = $("payment").value.trim();
  const query = rawQuery.toLowerCase();
  state.paymentMatches = state.payments
    .filter((payment) => payment.toLowerCase().includes(query))
    .slice(0, 7);
  const createText = rawQuery ? `Add new payment "${rawQuery}"` : "Add new payment";
  dropdown.innerHTML = `
    <button type="button" class="searchOption create" data-create-payment>
      <strong>${escapeHtml(createText)}</strong>
      <small>Use this payment method</small>
    </button>
    ${state.paymentMatches.map((payment, index) => {
      const canRemove = !isDefaultPayment(payment);
      return `
        <div class="searchOptionRow">
          <button type="button" class="searchOption" data-pick-payment="${index}">
            <strong>${escapeHtml(payment)}</strong>
          </button>
          ${canRemove ? `<button type="button" class="removeOptionBtn" data-remove-payment="${index}" aria-label="Remove ${escapeHtml(payment)}">X</button>` : ""}
        </div>
      `;
    }).join("")}
  `;
  dropdown.hidden = false;
  dropdown.querySelector("[data-create-payment]").onclick = () => selectPayment(rawQuery);
  dropdown.querySelectorAll("[data-pick-payment]").forEach((button) => {
    button.onclick = () => selectPayment(state.paymentMatches[button.dataset.pickPayment]);
  });
  dropdown.querySelectorAll("[data-remove-payment]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      removePayment(state.paymentMatches[button.dataset.removePayment]);
    };
  });
}

function selectPayment(name) {
  if (!name) return;
  name = name.trim();
  $("payment").value = name;
  rememberPayment(name);
  hidePaymentDropdown();
}

function hidePaymentDropdown() {
  $("paymentDropdown").hidden = true;
}

function rememberPayment(name) {
  name = String(name || "").trim();
  if (!name) return;
  if (isDefaultPayment(name)) return;
  if (!state.payments.some((payment) => payment.toLowerCase() === name.toLowerCase())) {
    state.payments.unshift(name);
    saveStoredPayments();
  }
}

function removePayment(name) {
  name = String(name || "").trim();
  if (!name || isDefaultPayment(name)) return;
  state.payments = state.payments.filter((payment) => payment.toLowerCase() !== name.toLowerCase());
  if ($("payment").value.trim().toLowerCase() === name.toLowerCase()) $("payment").value = "";
  saveStoredPayments();
  renderPaymentDropdown();
  showToast(`Payment removed: ${name}`);
}

function isDefaultPayment(name) {
  const key = String(name || "").trim().toLowerCase();
  return DEFAULT_PAYMENTS.some((payment) => payment.toLowerCase() === key);
}

function renderProducts() {
  const query = $("productSearch").value.trim().toLowerCase();
  const categories = ["All Menu", ...new Set(state.products.map((item) => item.category || "Other"))];
  if (!categories.includes(state.activeCategory)) state.activeCategory = "All Menu";
  const products = state.products
    .filter((item) => state.activeCategory === "All Menu" || (item.category || "Other") === state.activeCategory)
    .filter((item) => item.name.toLowerCase().includes(query))
    .slice(0, 80);
  $("productGrid").innerHTML = `
    <div class="categoryTabs">
      ${categories.map((category) => `
        <button class="categoryTab ${category === state.activeCategory ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">
          ${escapeHtml(category)}
        </button>
      `).join("")}
    </div>
    <div class="productSectionGrid">
      ${products.map((item) => `
        <button class="product" type="button" data-product="${state.products.indexOf(item)}">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${money(item.price)}</span>
        </button>
      `).join("") || `<div class="emptyCart">No menu found</div>`}
    </div>
  `;
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeCategory = button.dataset.category;
      renderProducts();
    });
  });
  document.querySelectorAll("[data-product]").forEach((button) => {
    button.addEventListener("click", () => addToCart(state.products[Number(button.dataset.product)]));
  });
}

function renderCart() {
  if (!state.cart.length) {
    $("cartLines").innerHTML = `<div class="emptyCart">Tap menu item to add</div>`;
  } else {
    $("cartLines").innerHTML = state.cart.map((item, index) => `
      <div class="cartLine">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <label class="priceEdit">Price
            <input type="number" min="0" step="500" value="${item.price}" data-price="${index}" />
          </label>
        </div>
        <div class="qtyBox">
          <button type="button" data-dec="${index}" aria-label="Decrease quantity">-</button>
          <strong>${item.qty}</strong>
          <button type="button" data-inc="${index}" aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="removeBtn" data-remove="${index}" aria-label="Remove item">x</button>
      </div>
    `).join("");
  }
  $("cartTotal").textContent = money(cartTotal());
  bindCartButtons();
}

function bindCartButtons() {
  document.querySelectorAll("[data-inc]").forEach((button) => button.onclick = () => { state.cart[button.dataset.inc].qty += 1; renderCart(); });
  document.querySelectorAll("[data-dec]").forEach((button) => button.onclick = () => {
    const item = state.cart[button.dataset.dec];
    item.qty -= 1;
    if (item.qty < 1) state.cart.splice(button.dataset.dec, 1);
    renderCart();
  });
  document.querySelectorAll("[data-remove]").forEach((button) => button.onclick = () => { state.cart.splice(button.dataset.remove, 1); renderCart(); });
  document.querySelectorAll("[data-price]").forEach((input) => {
    input.oninput = () => {
      state.cart[input.dataset.price].price = Number(input.value || 0);
      $("cartTotal").textContent = money(cartTotal());
    };
  });
}

function renderMembers() {
  const query = $("memberSearch").value.trim().toLowerCase();
  const members = state.members
    .filter((member) => `${member.name} ${member.id} ${member.contact}`.toLowerCase().includes(query));
  $("memberHint").textContent = `${state.members.length} saved`;
  $("memberList").innerHTML = members.map((member, index) => `
    <div class="memberRow">
      <div><strong>${escapeHtml(member.name)}</strong><br><small>${escapeHtml(member.id)} - ${escapeHtml(member.contact || "no contact")} - ${money(member.spend)}</small></div>
      <button class="ghostBtn" type="button" data-member="${index}">Use</button>
    </div>
  `).join("") || `<div class="muted">No members found</div>`;
  document.querySelectorAll("[data-member]").forEach((button) => button.onclick = () => selectMember(members[button.dataset.member]));
}

function renderMemberDropdown() {
  const dropdown = $("memberDropdown");
  const rawQuery = $("memberSearch").value.trim();
  const query = rawQuery.toLowerCase();
  state.memberMatches = state.members
    .filter((member) => `${member.name} ${member.id} ${member.contact}`.toLowerCase().includes(query))
    .slice(0, 7);
  const createText = rawQuery ? `Add new member "${rawQuery}"` : "Add new member";
  dropdown.innerHTML = `
    <button type="button" class="memberOption create" data-create-member>
      <strong>${escapeHtml(createText)}</strong>
      <small>Create member profile</small>
    </button>
    ${state.memberMatches.map((member, index) => `
      <button type="button" class="memberOption" data-pick-member="${index}">
        <strong>${escapeHtml(member.name)}</strong>
        <small>${escapeHtml(member.id)} - ${escapeHtml(member.contact || "no contact")} - ${money(member.spend)}</small>
      </button>
    `).join("")}
  `;
  dropdown.hidden = false;
  dropdown.querySelector("[data-create-member]").onclick = openMemberDialogFromSearch;
  dropdown.querySelectorAll("[data-pick-member]").forEach((button) => {
    button.onclick = () => selectMember(state.memberMatches[button.dataset.pickMember]);
  });
}

function hideMemberDropdown() {
  $("memberDropdown").hidden = true;
}

function openMemberDialogFromSearch() {
  const query = $("memberSearch").value.trim();
  if (query) $("memberName").value = query;
  hideMemberDropdown();
  $("memberDialog").showModal();
}

function renderRecent(transactions) {
  const todayDate = today();
  const todaysTransactions = transactions.filter((sale) => normalizeDateKey(sale.date) === todayDate);
  $("todaySales").innerHTML = renderTransactionRows(todaysTransactions) || `<div class="emptyCart">No transactions today</div>`;
  $("recentSales").innerHTML = renderTransactionRows(transactions) || `<div class="emptyCart">No transactions yet</div>`;
}

function renderTransactionRows(transactions) {
  return transactions.map((sale) => `
    <div class="saleRow">
      <div><strong>${escapeHtml(sale.item)}</strong><br><small>${escapeHtml(sale.orderId || "-")} - ${escapeHtml(sale.buyer || "Walk-in")} - ${escapeHtml(sale.type || "-")} - ${new Date(sale.date).toLocaleDateString("id-ID")} - ${escapeHtml(sale.payment || "-")}</small></div>
      <strong>${money(sale.total)}</strong>
    </div>
  `).join("");
}

function normalizeDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return localDateKey(date);
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function showToast(message) {
  const toast = $("toast");
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add("show"));
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => { toast.hidden = true; }, 200);
  }, 2200);
}

function showQrisConfirmation(amount) {
  $("qrisMeta").textContent = `Amount to collect: ${money(amount)}`;
  setQrisStatus("Payment page opened. Confirm only after the customer has completed payment.");
  const image = $("qrisImage");
  const link = $("qrisOpenLink");
  image.hidden = true;
  link.href = MIDTRANS_PAYMENT_LINK;
  link.hidden = false;
  $("qrisDialog").showModal();
  window.open(MIDTRANS_PAYMENT_LINK, "_blank", "noopener");
}

function setQrisStatus(message, state = "pending") {
  const status = $("qrisStatus");
  status.textContent = message;
  status.className = `qrisStatus ${state === "success" || state === "failed" ? state : ""}`.trim();
}

function waitForManualMidtransConfirmation(amount) {
  showQrisConfirmation(amount);
  return new Promise((resolve, reject) => {
    cancelQrisWait = () => {
      cancelQrisWait = null;
      reject(new Error("QR Midtrans confirmation was closed. Transaction was not saved."));
    };

    $("confirmQrisPaid").onclick = () => {
      cancelQrisWait = null;
      setQrisStatus("Payment confirmed. Saving transaction...", "success");
      resolve();
    };
  });
}

function resetCheckoutForm() {
  state.cart = [];
  state.selectedMember = null;
  $("checkoutForm").reset();
  $("buyer").disabled = false;
  $("saleDate").value = today();
  $("selectedMember").className = "selectedMember muted";
  $("selectedMember").textContent = "No member selected";
  hideMemberDropdown();
  hideCashierDropdown();
  hideTypeDropdown();
  renderCart();
}

function selectMember(member, notify = true) {
  state.selectedMember = member;
  $("selectedMember").className = "selectedMember active";
  $("selectedMember").textContent = `${member.id} - ${member.name}`;
  $("memberSearch").value = `${member.id} - ${member.name}`;
  $("buyer").value = member.name;
  $("buyer").disabled = true;
  $("phone").value = member.contact || "";
  hideMemberDropdown();
  if (notify) showToast(`Member selected: ${member.name} (${member.id})`);
}

function clearSelectedMember() {
  if (state.selectedMember) {
    if ($("buyer").value === state.selectedMember.name) $("buyer").value = "";
    if ($("phone").value === (state.selectedMember.contact || "")) $("phone").value = "";
  }
  state.selectedMember = null;
  $("buyer").disabled = false;
  $("selectedMember").className = "selectedMember muted";
  $("selectedMember").textContent = "No member selected";
}

function addToCart(product) {
  const existing = state.cart.find((item) => item.name === product.name && item.price === product.price);
  if (existing) existing.qty += 1;
  else state.cart.push({ name: product.name, price: product.price, qty: 1 });
  renderCart();
}

function cartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

async function loadData() {
  $("syncState").textContent = "Reading Master Data - AXON.xlsx...";
  const data = await api("/api/bootstrap");
  state.products = data.products;
  state.members = data.members;
  renderSummary(data.summary);
  renderCampaigns(data.campaigns);
  state.payments = mergePaymentLabels(loadStoredPayments(), DEFAULT_PAYMENTS);
  state.cashiers = data.cashiers;
  state.types = mergeUniqueLabels(data.types || [], state.types);
  renderOptions("cashier", data.cashiers);
  renderProducts();
  renderMembers();
  renderRecent(data.transactions);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function mergeUniqueLabels(primary, fallback) {
  const seen = new Set();
  return [...primary, ...fallback].map((value) => String(value || "").trim().toUpperCase()).filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function mergePaymentLabels(primary, fallback) {
  const seen = new Set();
  return [...primary, ...fallback].map((value) => String(value || "").trim()).filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loadStoredPayments() {
  try {
    const values = JSON.parse(localStorage.getItem(PAYMENT_STORAGE_KEY) || "[]");
    return Array.isArray(values) ? values.filter((value) => !isDefaultPayment(value)) : [];
  } catch {
    return [];
  }
}

function saveStoredPayments() {
  localStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(state.payments));
}

function isQrMidtrans(value) {
  return String(value || "").trim().toUpperCase() === "QR MIDTRANS";
}

$("saleDate").value = today();
$("productSearch").addEventListener("input", renderProducts);
$("memberSearch").addEventListener("input", () => {
  if (state.selectedMember) {
    const selectedText = `${state.selectedMember.id} - ${state.selectedMember.name}`;
    if ($("memberSearch").value.trim() !== selectedText) clearSelectedMember();
  }
  renderMembers();
  renderMemberDropdown();
});
$("memberSearch").addEventListener("focus", renderMemberDropdown);
$("memberSearch").addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideMemberDropdown();
  if (event.key === "Enter") {
    event.preventDefault();
    if (state.memberMatches[0]) selectMember(state.memberMatches[0]);
    else openMemberDialogFromSearch();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".memberSearch")) hideMemberDropdown();
  if (!event.target.closest(".cashierSearch")) hideCashierDropdown();
  if (!event.target.closest(".typeSearch")) hideTypeDropdown();
  if (!event.target.closest(".paymentSearch")) hidePaymentDropdown();
});
$("cashier").addEventListener("input", renderCashierDropdown);
$("cashier").addEventListener("blur", () => { $("cashier").value = $("cashier").value.trim().toUpperCase(); });
$("cashier").addEventListener("focus", renderCashierDropdown);
$("cashier").addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideCashierDropdown();
  if (event.key === "Enter") {
    event.preventDefault();
    selectCashier(state.cashierMatches[0] || $("cashier").value.trim());
  }
});
$("customerType").addEventListener("input", renderTypeDropdown);
$("customerType").addEventListener("blur", () => { $("customerType").value = $("customerType").value.trim().toUpperCase(); });
$("customerType").addEventListener("focus", renderTypeDropdown);
$("customerType").addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideTypeDropdown();
  if (event.key === "Enter") {
    event.preventDefault();
    selectType(state.typeMatches[0] || $("customerType").value.trim());
  }
});
$("payment").addEventListener("input", renderPaymentDropdown);
$("payment").addEventListener("focus", renderPaymentDropdown);
$("payment").addEventListener("keydown", (event) => {
  if (event.key === "Escape") hidePaymentDropdown();
  if (event.key === "Enter") {
    event.preventDefault();
    selectPayment(state.paymentMatches[0] || $("payment").value.trim());
  }
});
$("refreshBtn").addEventListener("click", loadData);
$("clearCart").addEventListener("click", () => { state.cart = []; renderCart(); });
$("addCustom").addEventListener("click", () => {
  const name = $("customName").value.trim();
  const price = Number($("customPrice").value || 0);
  if (!name || price <= 0) return;
  addToCart({ name, price });
  $("customName").value = "";
  $("customPrice").value = "";
});

$("checkoutForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.cart.length) return alert("Cart is empty");
  const submitButton = $("checkoutForm").querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "Processing...";
  const payload = {
    date: $("saleDate").value,
    cashier: $("cashier").value,
    memberId: state.selectedMember?.id || "",
    buyer: state.selectedMember?.name || $("buyer").value,
    phone: $("phone").value,
    type: $("customerType").value.trim().toUpperCase(),
    payment: $("payment").value.trim(),
    items: state.cart.map((item) => ({ ...item })),
  };
  rememberPayment(payload.payment);

  try {
    if (isQrMidtrans(payload.payment)) {
      await waitForManualMidtransConfirmation(cartTotal());
    }

    const transaction = await api("/api/transactions", { method: "POST", body: JSON.stringify(payload) });
    showToast(`Transaction saved: ${transaction.orderId}`);
    if (isQrMidtrans(payload.payment)) $("qrisDialog").close();
    resetCheckoutForm();
    await loadData();
  } catch (error) {
    alert(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Save Transaction";
  }
});

$("cancelMember").addEventListener("click", () => $("memberDialog").close());
$("closeQris").addEventListener("click", () => {
  $("qrisDialog").close();
  if (cancelQrisWait) cancelQrisWait();
  showToast("QR confirmation closed. Transaction was not saved.");
});
$("memberForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const member = await api("/api/members", {
    method: "POST",
    body: JSON.stringify({ name: $("memberName").value, contact: $("memberContact").value }),
  });
  state.members.unshift(member);
  selectMember(member, false);
  renderMembers();
  $("memberForm").reset();
  $("memberDialog").close();
});

renderCart();
loadData().catch((error) => {
  $("syncState").textContent = error.message;
  console.error(error);
});

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach((tab) => tab.classList.remove("active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    button.classList.add("active");
    $(button.dataset.tab).classList.add("active");
  });
});
