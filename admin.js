const TOKEN_KEY = "mz-tech-hub-admin-token";
const USER_KEY = "mz-tech-hub-admin-user";
const STATUSES = [
  "received",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];
const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
});
const loginScreen = document.querySelector("#login-screen");
const appShell = document.querySelector("#app-shell");
const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");
const globalNotice = document.querySelector("#global-notice");
const toast = document.querySelector("#toast");
const productDialog = document.querySelector("#product-dialog");
const productForm = document.querySelector("#product-form");
const productFormMessage = document.querySelector("#product-form-message");
const orderDialog = document.querySelector("#order-dialog");
let products = [];
let inventory = [];
let currentEditingProduct = null;
let toastTimer;
let orderOffset = 0;
let orderTotal = 0;
const ORDER_PAGE_SIZE = 50;

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function showNotice(message, isSuccess = false) {
  globalNotice.textContent = message;
  globalNotice.classList.toggle("success", isSuccess);
  globalNotice.hidden = false;
}

function clearNotice() {
  globalNotice.hidden = true;
  globalNotice.textContent = "";
}

function setSignedOut(message = "") {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  appShell.hidden = true;
  loginScreen.hidden = false;
  loginMessage.textContent = message;
}

async function api(path, options = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined)
    headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...options, headers });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      `The server returned an invalid response (${response.status}).`,
    );
  }
  if (response.status === 401 && token) {
    setSignedOut("Your admin session has expired. Please sign in again.");
    throw new Error(payload.error || "Admin sign-in is required.");
  }
  if (!response.ok)
    throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

async function runAction(action) {
  clearNotice();
  try {
    await action();
  } catch (error) {
    showNotice(error.message || "Something went wrong. Please try again.");
  }
}

function getCurrentDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(
    undefined,
    includeTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" },
  ).format(date);
}

function stockClass(quantity) {
  return quantity <= 0 ? "out" : quantity < 5 ? "low" : "";
}

function stockLabel(quantity) {
  return quantity <= 0
    ? "Out of stock"
    : quantity < 5
      ? "Low stock"
      : "In stock";
}

function setUserDisplay(user) {
  const name = user?.name || user?.email || "Shop admin";
  document.querySelector("#user-name").textContent = name;
  document.querySelector("#user-avatar").textContent =
    name.trim().slice(0, 1).toUpperCase() || "M";
}

function showDashboard(user) {
  setUserDisplay(user);
  loginScreen.hidden = true;
  appShell.hidden = false;
  navigateTo("overview");
}

function navigateTo(pageName) {
  const page = document.querySelector(`#page-${pageName}`);
  if (!page) return;
  document
    .querySelectorAll(".page")
    .forEach((element) => element.classList.toggle("active", element === page));
  document
    .querySelectorAll(".nav-item")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.page === pageName),
    );
  document.querySelector("#page-title").textContent =
    pageName === "sales"
      ? "Sales & reports"
      : `${pageName[0].toUpperCase()}${pageName.slice(1)}`;
  document.querySelector("#sidebar").classList.remove("open");
  clearNotice();
  const loaders = {
    overview: loadOverview,
    products: loadProducts,
    orders: loadOrders,
    inventory: loadInventory,
    sales: loadSalesPage,
  };
  void runAction(loaders[pageName]);
}

async function loadOverview() {
  const date = getCurrentDate();
  const [productData, stockData, orderData, todayOrderData, salesData] =
    await Promise.all([
      api("/api/admin/products"),
      api("/api/admin/inventory"),
      api("/api/admin/orders?limit=5"),
      api(`/api/admin/orders?limit=1&from=${date}&to=${date}`),
      api(`/api/admin/sales/daily?date=${date}`),
    ]);
  products = productData.products;
  inventory = stockData.inventory;
  const stockTotal = inventory.reduce((sum, item) => sum + item.quantity, 0);
  const lowStockCount = inventory.filter((item) => item.quantity < 5).length;
  document.querySelector("#stat-products").textContent = productData.total;
  document.querySelector("#stat-orders").textContent = todayOrderData.total;
  document.querySelector("#stat-stock").textContent =
    stockTotal.toLocaleString();
  document.querySelector("#stat-low-stock").textContent =
    `${lowStockCount} product${lowStockCount === 1 ? "" : "s"} low or out of stock`;
  document.querySelector("#stat-sales").textContent = salesData.saleCount;
  document.querySelector("#stat-revenue").textContent =
    `${money.format(salesData.total)} recorded today`;
  renderRecentOrders(orderData.orders.slice(0, 5));
}

function renderRecentOrders(orders) {
  const body = document.querySelector("#recent-orders");
  body.innerHTML = orders
    .map(
      (order) => `
    <tr>
      <td><button class="text-button order-details-button order-id" type="button" data-order-id="${escapeHtml(order.id)}">${escapeHtml(order.id)}</button></td>
      <td><strong>${escapeHtml(order.customer?.name)}</strong></td>
      <td>${escapeHtml(formatDate(order.createdAt))}</td>
      <td><strong>${money.format(order.total)}</strong></td>
      <td><span class="status-pill status-${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></td>
    </tr>`,
    )
    .join("");
  document.querySelector("#recent-orders-empty").hidden = orders.length > 0;
}

async function loadProducts() {
  const [catalog, stocks] = await Promise.all([
    api("/api/admin/products"),
    api("/api/admin/inventory"),
  ]);
  products = catalog.products;
  inventory = stocks.inventory;
  renderProducts(document.querySelector("#product-search").value);
  populateProductSelects();
}

function renderProducts(searchTerm = "") {
  const query = searchTerm.trim().toLowerCase();
  const filtered = products.filter((product) =>
    `${product.name} ${product.id} ${product.category}`
      .toLowerCase()
      .includes(query),
  );
  document.querySelector("#product-count").textContent =
    `${filtered.length} product${filtered.length === 1 ? "" : "s"}`;
  document.querySelector("#products-empty").hidden = filtered.length > 0;
  document.querySelector("#product-grid").innerHTML = filtered
    .map((product) => {
      const category = ["audio", "power"].includes(product.category)
        ? product.category
        : "other";
      const letter = escapeHtml(product.name.trim().slice(0, 1).toUpperCase());
      return `
      <article class="product-card">
        <div class="product-art ${category}"><span>${letter}</span><span class="product-category">${escapeHtml(product.category)}</span></div>
        <div class="product-body">
          <h3>${escapeHtml(product.name)}</h3><small class="product-id">/${escapeHtml(product.id)}</small>
          <div class="product-details"><strong class="product-price">${money.format(product.price)}</strong>
            <div class="product-actions"><button class="small-button edit-product" type="button" data-product-id="${escapeHtml(product.id)}">Edit</button><button class="small-button danger delete-product" type="button" data-product-id="${escapeHtml(product.id)}">Remove</button></div>
          </div>
        </div>
      </article>`;
    })
    .join("");
}

function populateProductSelects() {
  const optionMarkup = products
    .map(
      (product) =>
        `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)} — ${money.format(product.price)}</option>`,
    )
    .join("");
  document.querySelector("#inventory-product").innerHTML = optionMarkup;
  document.querySelector("#sale-product").innerHTML = optionMarkup;
  updateSalePreview();
}

async function loadOrders() {
  const query = new URLSearchParams({
    limit: String(ORDER_PAGE_SIZE),
    offset: String(orderOffset),
  });
  const status = document.querySelector("#order-status").value;
  const email = document.querySelector("#order-email").value.trim();
  if (status) query.set("status", status);
  if (email) query.set("email", email);
  const result = await api(`/api/admin/orders?${query.toString()}`);
  orderTotal = result.total;
  renderOrders(result.orders, orderOffset > 0);
  orderOffset += result.orders.length;
  document.querySelector("#orders-count").textContent =
    `Showing ${orderOffset} of ${orderTotal} orders`;
  document.querySelector("#orders-pagination").hidden = orderTotal === 0;
  document.querySelector("#load-more-orders").hidden =
    orderOffset >= orderTotal;
}

function renderOrders(orders, append = false) {
  const body = document.querySelector("#orders-table");
  const rows = orders
    .map((order) => {
      const itemsCount = order.items.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      const statusOptions = STATUSES.map(
        (status) =>
          `<option value="${status}" ${order.status === status ? "selected" : ""}>${status}</option>`,
      ).join("");
      return `
      <tr>
        <td><button class="text-button order-details-button order-id" type="button" data-order-id="${escapeHtml(order.id)}">${escapeHtml(order.id)}</button></td>
        <td><strong>${escapeHtml(order.customer?.name)}</strong><br /><small>${escapeHtml(order.customer?.email)}</small></td>
        <td>${itemsCount} item${itemsCount === 1 ? "" : "s"}</td>
        <td>${escapeHtml(formatDate(order.createdAt))}</td>
        <td><strong>${money.format(order.total)}</strong></td>
        <td><select class="status-select" aria-label="Update status for ${escapeHtml(order.id)}" data-order-status="${escapeHtml(order.id)}">${statusOptions}</select></td>
        <td><div class="order-quick-actions">
          <button class="small-button" type="button" data-order-quick-status="processing" data-order-id="${escapeHtml(order.id)}" aria-label="Mark order ${escapeHtml(order.id)} as processing" ${order.status === "processing" ? "disabled" : ""}>Process</button>
          <button class="small-button" type="button" data-order-quick-status="delivered" data-order-id="${escapeHtml(order.id)}" aria-label="Mark order ${escapeHtml(order.id)} as delivered" ${order.status === "delivered" ? "disabled" : ""}>Deliver</button>
          <button class="small-button order-details-button" type="button" data-order-id="${escapeHtml(order.id)}">View</button>
        </div></td>
      </tr>`;
    })
    .join("");
  if (append) body.insertAdjacentHTML("beforeend", rows);
  else body.innerHTML = rows;
  document.querySelector("#orders-empty").hidden =
    orderOffset > 0 || orders.length > 0;
}

function resetAndLoadOrders() {
  orderOffset = 0;
  return loadOrders();
}

async function updateOrderStatus(orderId, status) {
  await api(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  showToast(`Order ${orderId} marked ${status}.`);
  await resetAndLoadOrders();
}

async function showOrderDetails(orderId) {
  const result = await api(`/api/admin/orders/${encodeURIComponent(orderId)}`);
  const order = result.order;
  document.querySelector("#order-dialog-title").textContent =
    `Order ${order.id}`;
  document.querySelector("#order-details").innerHTML = `
    <div class="order-detail-grid">
      <span>Customer<strong>${escapeHtml(order.customer?.name)}</strong></span>
      <span>Email<strong>${escapeHtml(order.customer?.email)}</strong></span>
      <span>Placed<strong>${escapeHtml(formatDate(order.createdAt, true))}</strong></span>
      <span>Status<strong><span class="status-pill status-${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></strong></span>
    </div>
    <div class="order-detail-items">
      ${order.items.map((item) => `<div class="order-detail-item"><span>${escapeHtml(item.name)} × ${item.quantity}</span><strong>${money.format(item.lineTotal)}</strong></div>`).join("")}
    </div>
    <div class="order-detail-total"><span>Order total</span><span>${money.format(order.total)}</span></div>`;
  orderDialog.showModal();
}

async function loadInventory() {
  const result = await api("/api/admin/inventory");
  inventory = result.inventory;
  products = inventory;
  const body = document.querySelector("#inventory-table");
  body.innerHTML = inventory
    .map(
      (item) => `
    <tr>
      <td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.category)}</td>
      <td><span class="stock-number ${item.quantity < 5 ? "stock-low" : "stock-ok"}">${item.quantity}</span></td>
      <td><span class="stock-badge ${stockClass(item.quantity)}">${stockLabel(item.quantity)}</span></td>
    </tr>`,
    )
    .join("");
  document.querySelector("#inventory-empty").hidden = inventory.length > 0;
  populateProductSelects();
  const changes = await api("/api/admin/inventory/changes?limit=12");
  const history = document.querySelector("#inventory-history");
  history.innerHTML = changes.changes
    .map(
      (change) => `
    <tr>
      <td><strong>${escapeHtml(change.productName)}</strong></td>
      <td class="${change.quantityChange > 0 ? "stock-ok" : "stock-low"}">${change.quantityChange > 0 ? "+" : ""}${change.quantityChange}</td>
      <td>${change.resultingQuantity}</td><td>${escapeHtml(change.reason)}</td><td>${escapeHtml(formatDate(change.createdAt, true))}</td>
    </tr>`,
    )
    .join("");
  document.querySelector("#history-empty").hidden = changes.changes.length > 0;
}

async function loadSalesPage() {
  if (products.length === 0) {
    const result = await api("/api/admin/products");
    products = result.products;
    populateProductSelects();
  }
  const reportForm = document.querySelector("#report-form");
  if (!reportForm.elements.from.value) {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 6);
    reportForm.elements.from.value = start.toISOString().slice(0, 10);
    reportForm.elements.to.value = getCurrentDate();
  }
  await loadSalesReport();
}

async function loadSalesReport() {
  const form = document.querySelector("#report-form");
  const from = form.elements.from.value;
  const to = form.elements.to.value;
  const query = new URLSearchParams({ from, to });
  const report = await api(`/api/admin/sales/report?${query.toString()}`);
  document.querySelector("#report-summary").innerHTML = `
    <div><span>Total revenue</span><strong>${money.format(report.total)}</strong></div>
    <div><span>Sales</span><strong>${report.saleCount}</strong></div>
    <div><span>Items sold</span><strong>${report.itemCount}</strong></div>`;
  document.querySelector("#sales-report-table").innerHTML = report.byProduct
    .map(
      (item) => `
    <tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${item.quantity}</td><td>${money.format(item.revenue)}</td></tr>`,
    )
    .join("");
  document.querySelector("#sales-report-empty").hidden =
    report.byProduct.length > 0;
}

function openProductDialog(product = null) {
  currentEditingProduct = product;
  productForm.reset();
  productFormMessage.textContent = "";
  const isEditing = Boolean(product);
  document.querySelector("#product-dialog-title").textContent = isEditing
    ? "Edit product"
    : "Add a product";
  const idInput = productForm.elements.id;
  idInput.disabled = isEditing;
  idInput.required = !isEditing;
  if (product) {
    productForm.elements.id.value = product.id;
    productForm.elements.name.value = product.name;
    productForm.elements.category.value = product.category;
    productForm.elements.price.value = product.price;
  }
  productDialog.showModal();
  productForm.elements.name.focus();
}

async function saveProduct(event) {
  event.preventDefault();
  productFormMessage.textContent = "";
  const formData = new FormData(productForm);
  const payload = {
    name: String(formData.get("name")).trim(),
    category: String(formData.get("category")).trim(),
    price: Number(formData.get("price")),
  };
  if (currentEditingProduct) {
    await api(
      `/api/admin/products/${encodeURIComponent(currentEditingProduct.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );
    showToast("Product updated.");
  } else {
    payload.id = String(formData.get("id")).trim();
    await api("/api/admin/products", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    showToast("Product added to your shop.");
  }
  productDialog.close();
  await loadProducts();
}

async function removeProduct(productId) {
  const product = products.find((item) => item.id === productId);
  if (
    !product ||
    !window.confirm(
      `Remove "${product.name}" from the active catalog? Past orders and sales will be kept.`,
    )
  )
    return;
  await api(`/api/admin/products/${encodeURIComponent(productId)}`, {
    method: "DELETE",
  });
  showToast("Product removed from your shop.");
  await loadProducts();
}

function updateSalePreview() {
  const product = products.find(
    (item) => item.id === document.querySelector("#sale-product").value,
  );
  const quantity = Number(
    document.querySelector("#sale-form").elements.quantity.value,
  );
  document.querySelector("#sale-preview-total").textContent =
    product && quantity > 0 ? money.format(product.price * quantity) : "—";
}

async function recordSale(event) {
  event.preventDefault();
  const form = document.querySelector("#sale-form");
  const productId = form.elements.productId.value;
  const quantity = Number(form.elements.quantity.value);
  await api("/api/admin/sales", {
    method: "POST",
    body: JSON.stringify({
      items: [{ productId, quantity }],
      note: form.elements.note.value.trim(),
    }),
  });
  form.elements.quantity.value = "1";
  form.elements.note.value = "";
  updateSalePreview();
  showToast("Sale recorded successfully.");
  await loadSalesReport();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";
  const formData = new FormData(loginForm);
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = "Signing in…";
  try {
    const result = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        email: String(formData.get("email")).trim(),
        password: String(formData.get("password")),
      }),
    });
    sessionStorage.setItem(TOKEN_KEY, result.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(result.user));
    loginForm.reset();
    showDashboard(result.user);
  } catch (error) {
    loginMessage.textContent = error.message || "Unable to sign in.";
  } finally {
    button.disabled = false;
    button.textContent = "Sign in to dashboard";
  }
});

document
  .querySelectorAll(".nav-item")
  .forEach((button) =>
    button.addEventListener("click", () => navigateTo(button.dataset.page)),
  );
document
  .querySelectorAll("[data-open-page]")
  .forEach((button) =>
    button.addEventListener("click", () => navigateTo(button.dataset.openPage)),
  );
document
  .querySelector("#mobile-menu")
  .addEventListener("click", () =>
    document.querySelector("#sidebar").classList.toggle("open"),
  );
document
  .querySelector("#logout-button")
  .addEventListener("click", () => setSignedOut());
document
  .querySelector("#product-search")
  .addEventListener("input", (event) => renderProducts(event.target.value));
document
  .querySelector("#add-product-button")
  .addEventListener("click", () => openProductDialog());
document
  .querySelector("#overview-add-product")
  .addEventListener("click", () => {
    navigateTo("products");
    openProductDialog();
  });
document.querySelector("#product-grid").addEventListener("click", (event) => {
  const editButton = event.target.closest(".edit-product");
  const deleteButton = event.target.closest(".delete-product");
  if (editButton) {
    const product = products.find(
      (item) => item.id === editButton.dataset.productId,
    );
    if (product) openProductDialog(product);
  }
  if (deleteButton)
    void runAction(() => removeProduct(deleteButton.dataset.productId));
});
document
  .querySelector("#close-product-dialog")
  .addEventListener("click", () => productDialog.close());
document
  .querySelector("#cancel-product-dialog")
  .addEventListener("click", () => productDialog.close());
productForm.addEventListener("submit", (event) => {
  void (async () => {
    const submitButton = document.querySelector("#save-product-button");
    submitButton.disabled = true;
    try {
      await saveProduct(event);
    } catch (error) {
      productFormMessage.textContent =
        error.message || "Unable to save product.";
    } finally {
      submitButton.disabled = false;
    }
  })();
});
document
  .querySelector("#order-status")
  .addEventListener("change", () => void runAction(resetAndLoadOrders));
document.querySelector("#order-email").addEventListener("input", () => {
  window.clearTimeout(window.orderSearchTimer);
  window.orderSearchTimer = window.setTimeout(
    () => void runAction(resetAndLoadOrders),
    300,
  );
});
document
  .querySelector("#refresh-orders")
  .addEventListener("click", () => void runAction(resetAndLoadOrders));
document
  .querySelector("#load-more-orders")
  .addEventListener("click", () => void runAction(loadOrders));
document.querySelector("#orders-table").addEventListener("change", (event) => {
  const orderId = event.target.dataset.orderStatus;
  if (!orderId) return;
  void runAction(() => updateOrderStatus(orderId, event.target.value));
});
document.querySelector("#orders-table").addEventListener("click", (event) => {
  const button = event.target.closest("[data-order-quick-status]");
  if (!button) return;
  button.disabled = true;
  void runAction(() =>
    updateOrderStatus(button.dataset.orderId, button.dataset.orderQuickStatus),
  );
});
for (const tableId of ["#orders-table", "#recent-orders"]) {
  document.querySelector(tableId).addEventListener("click", (event) => {
    const button = event.target.closest(".order-details-button");
    if (button) void runAction(() => showOrderDetails(button.dataset.orderId));
  });
}
document
  .querySelector("#close-order-dialog")
  .addEventListener("click", () => orderDialog.close());
document
  .querySelector("#refresh-inventory")
  .addEventListener("click", () => void runAction(loadInventory));
document
  .querySelector("#inventory-form")
  .addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    void runAction(async () => {
      await api("/api/admin/inventory/adjust", {
        method: "POST",
        body: JSON.stringify({
          productId: form.elements.productId.value,
          quantityChange: Number(form.elements.quantityChange.value),
          reason: form.elements.reason.value.trim(),
        }),
      });
      form.reset();
      showToast("Inventory updated.");
      await loadInventory();
    });
  });
document
  .querySelector("#sale-product")
  .addEventListener("change", updateSalePreview);
document
  .querySelector("#sale-form")
  .elements.quantity.addEventListener("input", updateSalePreview);
document.querySelector("#sale-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void runAction(() => recordSale(event));
});
document.querySelector("#report-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void runAction(loadSalesReport);
});

const savedToken = sessionStorage.getItem(TOKEN_KEY);
if (savedToken) {
  let savedUser = {};
  try {
    savedUser = JSON.parse(sessionStorage.getItem(USER_KEY) || "{}");
  } catch (error) {
    console.error("Unable to restore the admin session profile:", error);
  }
  showDashboard(savedUser);
} else {
  loginScreen.hidden = false;
}
