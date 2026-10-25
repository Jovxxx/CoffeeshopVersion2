/* ==========================================================
   ADMIN DASHBOARD
   Coffee Shop Management System
========================================================== */

"use strict";

const db = window.supabaseClient;

/* ==========================================================
   BACKGROUND REFRESH HELPERS
   Whichever section is open refreshes itself, so these keep that
   from getting in the way: a list is only redrawn when its data
   actually changed, and a failed background refresh never replaces
   what's on screen with an error message.
========================================================== */

const lastSignatures = {};

function hasChanged(key, data) {

    const signature = JSON.stringify(data);

    if (lastSignatures[key] === signature) {
        return false;
    }

    lastSignatures[key] = signature;

    return true;

}

/* ==========================================================
   ELEMENTS
========================================================== */

const welcomeText = document.getElementById("welcomeText");
const logoutBtn = document.getElementById("logoutBtn");

const statToday = document.getElementById("statToday");
const statWeek = document.getElementById("statWeek");
const statMonth = document.getElementById("statMonth");

const salesToday = document.getElementById("salesToday");
const salesWeek = document.getElementById("salesWeek");
const salesMonth = document.getElementById("salesMonth");

const orderHistoryFilterTabs = document.getElementById("orderHistoryFilterTabs");
const orderHistoryStatus = document.getElementById("orderHistoryStatus");
const orderHistoryList = document.getElementById("orderHistoryList");

const bestSellersStatus = document.getElementById("bestSellersStatus");
const bestSellersList = document.getElementById("bestSellersList");

const feedbackFilterTabs = document.getElementById("feedbackFilterTabs");
const feedbackListStatus = document.getElementById("feedbackListStatus");
const feedbackList = document.getElementById("feedbackList");

const employeesStatus = document.getElementById("employeesStatus");
const employeesList = document.getElementById("employeesList");

const customersStatus = document.getElementById("customersStatus");
const customersList = document.getElementById("customersList");

const addCategoryForm = document.getElementById("addCategoryForm");
const categoryName = document.getElementById("categoryName");
const categoryDescription = document.getElementById("categoryDescription");
const categoryDisplayOrder = document.getElementById("categoryDisplayOrder");
const addCategoryBtn = document.getElementById("addCategoryBtn");
const addCategoryMessage = document.getElementById("addCategoryMessage");
const categoriesStatus = document.getElementById("categoriesStatus");
const categoriesList = document.getElementById("categoriesList");

const menuOverviewStatus = document.getElementById("menuOverviewStatus");
const menuOverviewList = document.getElementById("menuOverviewList");

const inventoryStatus = document.getElementById("inventoryStatus");
const inventoryList = document.getElementById("inventoryList");

const addEmployeeForm = document.getElementById("addEmployeeForm");
const employeeName = document.getElementById("employeeName");
const employeeEmail = document.getElementById("employeeEmail");
const employeePhone = document.getElementById("employeePhone");
const employeePassword = document.getElementById("employeePassword");
const addEmployeeBtn = document.getElementById("addEmployeeBtn");
const addEmployeeMessage = document.getElementById("addEmployeeMessage");


/* ==========================================================
   AUTH + ROLE GUARD
   Only 'Admin' may be on this page. Same idea as the other
   dashboards, but stricter - Employees are staff, but they
   are not allowed to promote other accounts.
========================================================== */

async function requireAdmin() {

    const { data: sessionData, error: sessionError } =
        await db.auth.getSession();

    if (sessionError || !sessionData.session) {

        window.location.href = "admin_login.html";
        return null;

    }

    const user = sessionData.session.user;

    const { data: profile, error: profileError } = await db

        .from("profiles")

        .select("full_name, role")

        .eq("auth_user_id", user.id)

        .single();

    if (profileError || !profile || profile.role !== "Admin") {

        await db.auth.signOut();
        window.location.href = "admin_login.html";
        return null;

    }

    return profile;

}


/* ==========================================================
   ORDER STATS

   Three simple counts with different date filters - each one
   is a lightweight "count only" query (head: true means
   Supabase doesn't even send back the row data, just the
   number), so this stays fast even as orders pile up.
========================================================== */

async function loadOrderStats() {

    const now = new Date();

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayResult, weekResult, monthResult] = await Promise.all([

        db.from("orders").select("*", { count: "exact", head: true })
            .gte("order_date", startOfToday.toISOString()),

        db.from("orders").select("*", { count: "exact", head: true })
            .gte("order_date", startOfWeek.toISOString()),

        db.from("orders").select("*", { count: "exact", head: true })
            .gte("order_date", startOfMonth.toISOString())

    ]);

    if (todayResult.count != null) statToday.textContent = todayResult.count;
    if (weekResult.count != null) statWeek.textContent = weekResult.count;
    if (monthResult.count != null) statMonth.textContent = monthResult.count;

    /* Sales totals - summed by the database (get_sales_totals) using
       the same date boundaries as the counts above, so the two rows
       of cards always describe the same periods. Only Completed orders
       count as sales: Pending/in-progress orders aren't paid for yet
       and Cancelled ones never will be. */

    const { data: salesData, error: salesError } = await db

        .rpc("get_sales_totals", {

            today_start: startOfToday.toISOString(),
            week_start: startOfWeek.toISOString(),
            month_start: startOfMonth.toISOString()

        });

    if (salesError || !salesData || salesData.length === 0) {

        console.error(salesError);

        return;

    }

    const totals = salesData[0];

    salesToday.textContent = formatPeso(totals.today_total);
    salesWeek.textContent = formatPeso(totals.week_total);
    salesMonth.textContent = formatPeso(totals.month_total);

}

function formatPeso(amount) {

    return "₱" + Number(amount || 0).toLocaleString("en-PH", {

        minimumFractionDigits: 2,
        maximumFractionDigits: 2

    });

}


/* ==========================================================
   ORDER HISTORY (read-only)

   Same data + rendering pattern as the employee dashboard's
   Order Queue, minus the action buttons - Admin reviews here,
   status changes still happen on the employee side, by design.
========================================================== */

const ORDER_HISTORY_ACTIVE_STATUSES = ["Pending", "Accepted", "Preparing", "Ready"];

let currentOrderHistoryFilter = "all";

orderHistoryFilterTabs.addEventListener("click", (event) => {

    const btn = event.target.closest(".filter-tab");

    if (!btn) {
        return;
    }

    currentOrderHistoryFilter = btn.dataset.filter;

    document

        .querySelectorAll("#orderHistoryFilterTabs .filter-tab")

        .forEach((tab) => tab.classList.remove("active"));

    btn.classList.add("active");

    loadOrderHistory();

});

async function loadOrderHistory(silent = false) {

    if (!silent) {
        orderHistoryStatus.textContent = "Loading orders...";
    }

    let query = db

        .from("orders")

        .select(`
            order_id,
            order_status,
            order_type,
            payment_status,
            total_amount,
            order_date,
            order_items(item_name, quantity),
            profiles!orders_customer_id_fkey(full_name)
        `)

        .order("order_date", { ascending: false });

    if (currentOrderHistoryFilter === "active") {

        query = query.in("order_status", ORDER_HISTORY_ACTIVE_STATUSES);

    } else if (currentOrderHistoryFilter !== "all") {

        query = query.eq("order_status", currentOrderHistoryFilter);

    }

    const { data, error } = await query;

    if (error) {

        console.error(error);

        if (!silent) {
            orderHistoryStatus.textContent = "Could not load orders right now.";
        }

        return;

    }

    if (!hasChanged("orderHistory:" + currentOrderHistoryFilter, data) && silent) {
        return;
    }

    if (!data || data.length === 0) {

        orderHistoryStatus.textContent = "No orders here.";
        orderHistoryList.innerHTML = "";
        return;

    }

    orderHistoryStatus.textContent = "";

    renderOrderHistory(data);

}

function renderOrderHistory(orders) {

    orderHistoryList.innerHTML = "";

    orders.forEach((order) => {

        const customerName = order.profiles ? order.profiles.full_name : "Unknown customer";

        const itemsSummary = (order.order_items || [])

            .map((it) => `${it.item_name} x${it.quantity}`)

            .join(", ");

        const orderDate = new Date(order.order_date).toLocaleString();

        const card = document.createElement("div");

        card.className = "order-card";

        card.innerHTML = `
            <div class="order-card-top">
                <div>
                    <div class="order-card-id">${customerName} · ${order.order_type}</div>
                    <div class="order-card-customer">${orderDate}</div>
                </div>
                <span class="order-status-badge ${order.order_status}">${order.order_status}</span>
            </div>
            <div class="order-card-items">${itemsSummary || "No items"}</div>
            <div class="order-card-bottom">
                Payment: ${order.payment_status} · ₱${Number(order.total_amount).toFixed(2)}
            </div>
        `;

        orderHistoryList.appendChild(card);

    });

}


/* ==========================================================
   BEST-SELLING PRODUCTS
   Calls the get_best_selling_products() database function
   instead of a plain table query, since this needs a SUM/
   GROUP BY across all order_items - not something the normal
   table API does on its own. The function itself checks
   is_admin() before returning anything.
========================================================== */

async function loadBestSellers(silent = false) {

    if (!silent) {
        bestSellersStatus.textContent = "Loading...";
    }

    const { data, error } = await db

        .rpc("get_best_selling_products", { limit_count: 5 });

    if (error) {

        console.error(error);

        if (!silent) {
            bestSellersStatus.textContent = "Could not load best sellers right now.";
        }

        return;

    }

    if (!hasChanged("bestSellers", data) && silent) {
        return;
    }

    if (!data || data.length === 0) {

        bestSellersStatus.textContent = "No sales yet.";
        bestSellersList.innerHTML = "";
        return;

    }

    bestSellersStatus.textContent = "";

    renderBestSellers(data);

}

function renderBestSellers(rows) {

    bestSellersList.innerHTML = "";

    rows.forEach((row, index) => {

        const rank = index + 1;

        const rowEl = document.createElement("div");

        rowEl.className = "best-seller-row";

        rowEl.innerHTML = `
            <div class="best-seller-rank ${rank === 1 ? "top" : ""}">${rank}</div>
            <div class="best-seller-info">
                <span class="best-seller-name">${row.item_name}</span>
                <span class="best-seller-meta">
                    ${row.total_quantity_sold} sold · ₱${Number(row.total_revenue).toFixed(2)} revenue
                </span>
            </div>
        `;

        bestSellersList.appendChild(rowEl);

    });

}


/* ==========================================================
   CUSTOMER FEEDBACK
========================================================== */

let currentFeedbackFilter = "new";

feedbackFilterTabs.addEventListener("click", (event) => {

    const btn = event.target.closest(".filter-tab");

    if (!btn) {
        return;
    }

    currentFeedbackFilter = btn.dataset.filter;

    document

        .querySelectorAll("#feedbackFilterTabs .filter-tab")

        .forEach((tab) => tab.classList.remove("active"));

    btn.classList.add("active");

    loadFeedback();

});

async function loadFeedback(silent = false) {

    if (!silent) {
        feedbackListStatus.textContent = "Loading feedback...";
    }

    let query = db

        .from("feedback")

        .select(`
            feedback_id,
            message,
            rating,
            is_reviewed,
            created_at,
            profiles!feedback_customer_id_fkey(full_name)
        `)

        .order("created_at", { ascending: false });

    if (currentFeedbackFilter === "new") {

        query = query.eq("is_reviewed", false);

    }

    const { data, error } = await query;

    if (error) {

        console.error(error);

        if (!silent) {
            feedbackListStatus.textContent = "Could not load feedback right now.";
        }

        return;

    }

    if (!hasChanged("feedback:" + currentFeedbackFilter, data) && silent) {
        return;
    }

    if (!data || data.length === 0) {

        feedbackListStatus.textContent =
            currentFeedbackFilter === "new"
                ? "No new feedback."
                : "No feedback yet.";

        feedbackList.innerHTML = "";

        return;

    }

    feedbackListStatus.textContent = "";

    renderFeedback(data);

}

function renderFeedback(rows) {

    feedbackList.innerHTML = "";

    rows.forEach((row) => {

        const customerName = row.profiles ? row.profiles.full_name : "Unknown customer";

        const stars = row.rating ? "★".repeat(row.rating) + "☆".repeat(5 - row.rating) : "";

        const rowEl = document.createElement("div");

        rowEl.className = "feedback-row" + (row.is_reviewed ? " reviewed" : "");

        const dateStr = new Date(row.created_at).toLocaleString();

        rowEl.innerHTML = `
            <div class="feedback-row-info">
                <div class="feedback-row-top">
                    <span class="feedback-row-customer">${customerName}</span>
                    ${stars ? `<span class="feedback-row-stars">${stars}</span>` : ""}
                </div>
                <span class="feedback-row-date">${dateStr}</span>
                <p class="feedback-row-message">${row.message}</p>
            </div>
        `;

        if (!row.is_reviewed) {

            const reviewBtn = document.createElement("button");

            reviewBtn.className = "feedback-review-btn";
            reviewBtn.textContent = "Mark Reviewed";

            reviewBtn.addEventListener("click", () => {

                markFeedbackReviewed(row.feedback_id, reviewBtn);

            });

            rowEl.appendChild(reviewBtn);

        }

        feedbackList.appendChild(rowEl);

    });

}

async function markFeedbackReviewed(feedbackId, button) {

    button.disabled = true;

    const { error } = await db

        .from("feedback")

        .update({ is_reviewed: true })

        .eq("feedback_id", feedbackId);

    if (error) {

        console.error(error);
        button.disabled = false;
        return;

    }

    await loadFeedback();

}


/* ==========================================================
   LOAD EMPLOYEES / CUSTOMERS
   Split into two separate queries and lists instead of one
   mixed list, so it's clear at a glance who's staff and who
   isn't. Admin accounts are excluded from both, to avoid
   Admins accidentally demoting each other from a simple list
   that was only ever meant for Customer <-> Employee moves.
========================================================== */

async function loadEmployees(silent = false) {

    if (!silent) {
        employeesStatus.textContent = "Loading employees...";
    }

    const { data, error } = await db

        .from("profiles")

        .select("profile_id, full_name, email, role")

        .eq("role", "Employee")

        .order("full_name", { ascending: true });

    if (error) {

        console.error(error);

        if (!silent) {
            employeesStatus.textContent = "Could not load employees right now.";
        }

        return;

    }

    if (!hasChanged("employees", data) && silent) {
        return;
    }

    if (!data || data.length === 0) {

        employeesStatus.textContent = "No employees yet.";
        employeesList.innerHTML = "";
        return;

    }

    employeesStatus.textContent = "";

    renderEmployeeRows(employeesList, data);

}

async function loadCustomers(silent = false) {

    if (!silent) {
        customersStatus.textContent = "Loading customers...";
    }

    const { data, error } = await db

        .from("profiles")

        .select("profile_id, full_name, status")

        .eq("role", "Customer")

        .order("full_name", { ascending: true });

    if (error) {

        console.error(error);

        if (!silent) {
            customersStatus.textContent = "Could not load customers right now.";
        }

        return;

    }

    /* Redrawing the list would collapse an order history the admin
       currently has open - hold off until they close it */

    if (silent && customersList.querySelector(".customer-order-history.open")) {
        return;
    }

    if (!hasChanged("customers", data) && silent) {
        return;
    }

    if (!data || data.length === 0) {

        customersStatus.textContent = "No customer accounts yet.";
        customersList.innerHTML = "";
        return;

    }

    customersStatus.textContent = "";

    renderCustomerRows(customersList, data);

}


/* ==========================================================
   RENDER EMPLOYEE ROWS
   Every row here is always an Employee, so the only action
   possible is reverting them back to Customer - there's no
   "promote" pathway anymore, since Add New Employee is now
   the one and only way an account becomes staff.
========================================================== */

function renderEmployeeRows(container, accounts) {

    container.innerHTML = "";

    accounts.forEach((account) => {

        const row = document.createElement("div");

        row.className = "account-row";

        row.innerHTML = `
            <div class="account-info">
                <span class="account-name">
                    ${account.full_name}
                    <span class="role-badge employee">Employee</span>
                </span>
                <span class="account-meta">${account.email}</span>
            </div>
        `;

        const button = document.createElement("button");

        button.className = "role-btn revert";
        button.textContent = "Revert to Customer";

        button.addEventListener("click", () => {

            changeRole(account.profile_id, "Customer", button);

        });

        row.appendChild(button);

        container.appendChild(row);

    });

}


/* ==========================================================
   RENDER CUSTOMER ROWS
   Each row has a Block/Unblock toggle (using the existing
   profiles.status column) and a "View Orders" button that
   expands an order history panel below the row, fetched on
   demand rather than loaded for every customer up front.
========================================================== */

function renderCustomerRows(container, accounts) {

    container.innerHTML = "";

    accounts.forEach((account) => {

        const wrapper = document.createElement("div");

        wrapper.className = "customer-wrapper";

        const row = document.createElement("div");

        row.className = "account-row";

        const isBlocked = account.status !== "Active";

        row.innerHTML = `
            <div class="account-info">
                <span class="account-name">
                    ${account.full_name}
                    <span class="role-badge customer">Customer</span>
                    ${isBlocked ? '<span class="role-badge blocked">Blocked</span>' : ""}
                </span>
            </div>
        `;

        const actions = document.createElement("div");

        actions.className = "customer-row-actions";

        const viewOrdersBtn = document.createElement("button");

        viewOrdersBtn.className = "role-btn view-orders";
        viewOrdersBtn.textContent = "View Orders";

        const historyContainer = document.createElement("div");

        historyContainer.className = "customer-order-history";

        let historyLoaded = false;

        viewOrdersBtn.addEventListener("click", () => {

            const isOpen = historyContainer.classList.toggle("open");

            viewOrdersBtn.textContent = isOpen ? "Hide Orders" : "View Orders";

            if (isOpen && !historyLoaded) {

                historyLoaded = true;

                loadCustomerOrderHistory(account.profile_id, historyContainer);

            }

        });

        const statusBtn = document.createElement("button");

        statusBtn.className = "role-btn " + (isBlocked ? "promote" : "revert");
        statusBtn.textContent = isBlocked ? "Unblock" : "Block";

        statusBtn.addEventListener("click", () => {

            const confirmed = isBlocked
                ? true
                : window.confirm(`Block ${account.full_name}? They won't be able to log in or order until unblocked.`);

            if (!confirmed) {
                return;
            }

            changeCustomerStatus(account.profile_id, isBlocked ? "Active" : "Inactive", statusBtn);

        });

        actions.appendChild(viewOrdersBtn);
        actions.appendChild(statusBtn);

        row.appendChild(actions);

        wrapper.appendChild(row);
        wrapper.appendChild(historyContainer);

        container.appendChild(wrapper);

    });

}


/* ==========================================================
   CUSTOMER ORDER HISTORY (per customer, on demand)
========================================================== */

async function loadCustomerOrderHistory(profileId, container) {

    container.innerHTML = '<p class="accounts-status">Loading order history...</p>';

    const { data, error } = await db

        .from("orders")

        .select(`
            order_id,
            order_status,
            order_type,
            payment_status,
            total_amount,
            order_date,
            order_items(item_name, quantity)
        `)

        .eq("customer_id", profileId)

        .order("order_date", { ascending: false });

    if (error) {

        console.error(error);
        container.innerHTML = '<p class="accounts-status">Could not load order history.</p>';
        return;

    }

    if (!data || data.length === 0) {

        container.innerHTML = '<p class="accounts-status">No orders from this customer yet.</p>';
        return;

    }

    container.innerHTML = "";

    data.forEach((order) => {

        const itemsSummary = (order.order_items || [])

            .map((it) => `${it.item_name} x${it.quantity}`)

            .join(", ");

        const orderDate = new Date(order.order_date).toLocaleString();

        const card = document.createElement("div");

        card.className = "order-card mini";

        card.innerHTML = `
            <div class="order-card-top">
                <div class="order-card-customer">${orderDate} · ${order.order_type}</div>
                <span class="order-status-badge ${order.order_status}">${order.order_status}</span>
            </div>
            <div class="order-card-items">${itemsSummary || "No items"}</div>
            <div class="order-card-bottom">
                Payment: ${order.payment_status} · ₱${Number(order.total_amount).toFixed(2)}
            </div>
        `;

        container.appendChild(card);

    });

}


/* ==========================================================
   CHANGE ROLE
   Updates profiles.role directly - allowed because of the
   "Admins can update all profiles" RLS policy already on
   the table. No new table or trigger needed.
========================================================== */

async function changeRole(profileId, newRole, button) {

    button.disabled = true;

    const { error } = await db

        .from("profiles")

        .update({ role: newRole })

        .eq("profile_id", profileId);

    if (error) {

        console.error(error);
        button.disabled = false;
        return;

    }

    /* Reload both lists - a role change moves the row from
       one list to the other, so both need to refresh */

    await loadEmployees();

    await loadCustomers();

}


/* ==========================================================
   CHANGE CUSTOMER STATUS (block / unblock)
   Updates profiles.status - enforced not just here but at the
   database level too (see is_active_customer() and the RLS
   policies on orders/order_items/feedback), so a blocked
   customer can't place orders even with an existing session.
========================================================== */

async function changeCustomerStatus(profileId, newStatus, button) {

    button.disabled = true;

    const { error } = await db

        .from("profiles")

        .update({ status: newStatus })

        .eq("profile_id", profileId);

    if (error) {

        console.error(error);
        button.disabled = false;
        return;

    }

    await loadCustomers();

}


/* ==========================================================
   ADD NEW EMPLOYEE

   There is no admin-only "create any user" function available
   from browser code (that requires Supabase's secret service
   key, which must never sit in client-side JS). So this uses
   the same signUp() the customer register page uses - except
   signUp() also swaps the browser's active session to the
   newly created account. To stop that from silently logging
   the admin out, we save the admin's session first and
   restore it right after.
========================================================== */

function showAddEmployeeMessage(text, type = "") {

    addEmployeeMessage.textContent = text;
    addEmployeeMessage.className = "";

    if (type !== "") {
        addEmployeeMessage.classList.add(type);
    }

}

function setAddEmployeeLoading(isLoading) {

    if (isLoading) {

        addEmployeeBtn.disabled = true;
        addEmployeeBtn.dataset.originalText = addEmployeeBtn.textContent;
        addEmployeeBtn.textContent = "Adding...";

    } else {

        addEmployeeBtn.disabled = false;
        addEmployeeBtn.textContent = addEmployeeBtn.dataset.originalText || "Add Employee";

    }

}

function isValidEmail(value) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

}

function validateAddEmployeeForm() {

    showAddEmployeeMessage("");

    if (employeeName.value.trim() === "") {

        showAddEmployeeMessage("Please enter the employee's full name.", "error");
        employeeName.focus();
        return false;

    }

    if (!isValidEmail(employeeEmail.value.trim())) {

        showAddEmployeeMessage("Please enter a valid email address.", "error");
        employeeEmail.focus();
        return false;

    }

    if (employeePassword.value.length < 8) {

        showAddEmployeeMessage("Temporary password must be at least 8 characters.", "error");
        employeePassword.focus();
        return false;

    }

    return true;

}

function getFriendlyCreateError(error) {

    const lower = ((error && error.message) || "").toLowerCase();

    if (lower.includes("already registered") ||
        lower.includes("already exists")) {

        return "An account with this email already exists.";

    }

    if (lower.includes("password")) {

        return "Password does not meet the requirements. Try a longer password.";

    }

    return "Could not create the account. Please try again.";

}

async function addEmployeeAccount() {

    const nameValue = employeeName.value.trim();
    const emailValue = employeeEmail.value.trim();
    const phoneValue = employeePhone.value.trim();
    const passwordValue = employeePassword.value;

    setAddEmployeeLoading(true);

    try {

        /* Step 1: Save the admin's current session so we can
           restore it after signUp() swaps the active session */

        const { data: adminSessionData } = await db.auth.getSession();

        const adminSession = adminSessionData.session;

        /* Step 2: Create the new auth user + profile (via the
           handle_new_user trigger, same as customer register) */

        const { data: signUpData, error: signUpError } =
            await db.auth.signUp({

                email: emailValue,

                password: passwordValue,

                options: {

                    data: {

                        full_name: nameValue,

                        phone: phoneValue

                    }

                }

            });

        if (signUpError) {

            showAddEmployeeMessage(getFriendlyCreateError(signUpError), "error");
            return;

        }

        const newUserId = signUpData.user ? signUpData.user.id : null;

        /* Step 3: Restore the admin's session immediately,
           before doing anything else that needs Admin rights */

        if (adminSession) {

            await db.auth.setSession({

                access_token: adminSession.access_token,

                refresh_token: adminSession.refresh_token

            });

        }

        /* Step 4: Promote the new account from the default
           Customer role to Employee - only works now because
           the admin session above was just restored */

        if (newUserId) {

            const { error: roleError } = await db

                .from("profiles")

                .update({ role: "Employee" })

                .eq("auth_user_id", newUserId);

            if (roleError) {

                console.error(roleError);

                showAddEmployeeMessage(

                    "Account created, but could not set it as Employee. Promote it manually below.",

                    "error"

                );

                await loadEmployees();
                await loadCustomers();

                return;

            }

        }

        showAddEmployeeMessage(

            "Employee account created! Share the email and temporary password with them.",

            "success"

        );

        addEmployeeForm.reset();

        await loadEmployees();
        await loadCustomers();

    } catch (err) {

        console.error(err);
        showAddEmployeeMessage("Unexpected error. Please try again.", "error");

    } finally {

        setAddEmployeeLoading(false);

    }

}

addEmployeeForm.addEventListener("submit", (event) => {

    event.preventDefault();

    if (!validateAddEmployeeForm()) {
        return;
    }

    addEmployeeAccount();

});


/* ==========================================================
   CATEGORY MANAGEMENT
========================================================== */

function showAddCategoryMessage(text, type = "") {

    addCategoryMessage.textContent = text;
    addCategoryMessage.className = "";

    if (type !== "") {
        addCategoryMessage.classList.add(type);
    }

}

function setAddCategoryLoading(isLoading) {

    if (isLoading) {

        addCategoryBtn.disabled = true;
        addCategoryBtn.dataset.originalText = addCategoryBtn.textContent;
        addCategoryBtn.textContent = "Adding...";

    } else {

        addCategoryBtn.disabled = false;
        addCategoryBtn.textContent = addCategoryBtn.dataset.originalText || "Add Category";

    }

}

function validateAddCategoryForm() {

    showAddCategoryMessage("");

    if (categoryName.value.trim() === "") {

        showAddCategoryMessage("Please enter a category name.", "error");
        categoryName.focus();
        return false;

    }

    return true;

}

async function addCategory() {

    setAddCategoryLoading(true);

    try {

        const displayOrderValue = parseInt(categoryDisplayOrder.value, 10);

        const { error } = await db

            .from("categories")

            .insert({

                category_name: categoryName.value.trim(),

                description: categoryDescription.value.trim() || null,

                display_order: isNaN(displayOrderValue) ? 1 : displayOrderValue

            });

        if (error) {

            console.error(error);

            const lower = error.message.toLowerCase();

            if (lower.includes("duplicate") || lower.includes("unique")) {

                showAddCategoryMessage("A category with this name already exists.", "error");

            } else {

                showAddCategoryMessage("Could not add the category. Please try again.", "error");

            }

            return;

        }

        showAddCategoryMessage("Category added successfully!", "success");

        addCategoryForm.reset();

        categoryDisplayOrder.value = "1";

        await loadCategories();

    } catch (err) {

        console.error(err);
        showAddCategoryMessage("Unexpected error. Please try again.", "error");

    } finally {

        setAddCategoryLoading(false);

    }

}

addCategoryForm.addEventListener("submit", (event) => {

    event.preventDefault();

    if (!validateAddCategoryForm()) {
        return;
    }

    addCategory();

});


async function loadCategories(silent = false) {

    if (!silent) {
        categoriesStatus.textContent = "Loading categories...";
    }

    const { data, error } = await db

        .from("categories")

        .select("category_id, category_name, description, display_order")

        .order("display_order", { ascending: true });

    if (error) {

        console.error(error);

        if (!silent) {
            categoriesStatus.textContent = "Could not load categories right now.";
        }

        return;

    }

    if (silent && categoriesList.querySelector(".category-edit-row")) {
        return;
    }

    if (!hasChanged("categories", data) && silent) {
        return;
    }

    if (!data || data.length === 0) {

        categoriesStatus.textContent = "No categories yet. Add one above.";
        categoriesList.innerHTML = "";
        return;

    }

    categoriesStatus.textContent = "";

    renderCategories(data);

}


function renderCategories(categories) {

    categoriesList.innerHTML = "";

    categories.forEach((cat) => {

        const row = document.createElement("div");

        row.className = "category-row";

        renderCategoryDisplayMode(row, cat);

        categoriesList.appendChild(row);

    });

}

function renderCategoryDisplayMode(row, cat) {

    row.innerHTML = "";

    const info = document.createElement("div");

    info.className = "category-info";

    info.innerHTML = `
        <span class="category-name">${cat.category_name}</span>
        <span class="category-meta">
            Order: ${cat.display_order}${cat.description ? " · " + cat.description : ""}
        </span>
    `;

    const actions = document.createElement("div");

    actions.className = "category-actions";

    const editBtn = document.createElement("button");

    editBtn.className = "category-btn edit";
    editBtn.textContent = "Edit";

    editBtn.addEventListener("click", () => {

        renderCategoryEditMode(row, cat);

    });

    const deleteBtn = document.createElement("button");

    deleteBtn.className = "category-btn delete";
    deleteBtn.textContent = "Delete";

    deleteBtn.addEventListener("click", () => {

        deleteCategory(cat.category_id, cat.category_name, deleteBtn);

    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    row.appendChild(info);
    row.appendChild(actions);

}

function renderCategoryEditMode(row, cat) {

    row.innerHTML = "";

    const editWrap = document.createElement("div");

    editWrap.className = "category-edit-row";

    const nameInput = document.createElement("input");

    nameInput.type = "text";
    nameInput.value = cat.category_name;
    nameInput.placeholder = "Category name";

    const descInput = document.createElement("input");

    descInput.type = "text";
    descInput.value = cat.description || "";
    descInput.placeholder = "Description (optional)";

    const orderInput = document.createElement("input");

    orderInput.type = "number";
    orderInput.min = "1";
    orderInput.value = cat.display_order;
    orderInput.placeholder = "Display order";

    const editActions = document.createElement("div");

    editActions.className = "category-edit-actions";

    const saveBtn = document.createElement("button");

    saveBtn.className = "category-btn save";
    saveBtn.textContent = "Save";

    saveBtn.addEventListener("click", () => {

        if (nameInput.value.trim() === "") {

            nameInput.focus();
            return;

        }

        const newOrder = parseInt(orderInput.value, 10);

        saveCategory(cat.category_id, {

            category_name: nameInput.value.trim(),
            description: descInput.value.trim() || null,
            display_order: isNaN(newOrder) ? 1 : newOrder

        }, saveBtn);

    });

    const cancelBtn = document.createElement("button");

    cancelBtn.className = "category-btn cancel";
    cancelBtn.textContent = "Cancel";

    cancelBtn.addEventListener("click", () => {

        renderCategoryDisplayMode(row, cat);

    });

    editActions.appendChild(saveBtn);
    editActions.appendChild(cancelBtn);

    editWrap.appendChild(nameInput);
    editWrap.appendChild(descInput);
    editWrap.appendChild(orderInput);
    editWrap.appendChild(editActions);

    row.appendChild(editWrap);

}

async function saveCategory(categoryId, updates, button) {

    button.disabled = true;

    const { error } = await db

        .from("categories")

        .update(updates)

        .eq("category_id", categoryId);

    if (error) {

        console.error(error);

        const lower = error.message.toLowerCase();

        if (lower.includes("duplicate") || lower.includes("unique")) {

            alert("A category with this name already exists.");

        } else {

            alert("Could not save changes. Please try again.");

        }

        button.disabled = false;
        return;

    }

    await loadCategories();

}

async function deleteCategory(categoryId, name, button) {

    const confirmed = window.confirm(`Delete "${name}"? This cannot be undone.`);

    if (!confirmed) {
        return;
    }

    button.disabled = true;

    const { error } = await db

        .from("categories")

        .delete()

        .eq("category_id", categoryId);

    if (error) {

        console.error(error);

        const lower = error.message.toLowerCase();

        if (lower.includes("violates foreign key")) {

            alert(`"${name}" has menu items assigned to it and cannot be deleted. Move or delete those items first.`);

        } else {

            alert("Could not delete this category. Please try again.");

        }

        button.disabled = false;
        return;

    }

    await loadCategories();

}


/* ==========================================================
   MENU OVERVIEW

   Shows every menu item, however an employee created it, so
   Admin can catch a mistyped price without needing to log in
   as staff. Everything here is read-only except the price,
   which can be corrected inline - name, category, description
   and availability stay employee-managed, by design.
========================================================== */

async function loadMenuOverview(silent = false) {

    if (!silent) {
        menuOverviewStatus.textContent = "Loading menu...";
    }

    const { data, error } = await db

        .from("menu")

        .select("menu_id, item_name, price, availability, categories(category_name)")

        .order("item_name", { ascending: true });

    if (error) {

        console.error(error);

        if (!silent) {
            menuOverviewStatus.textContent = "Could not load the menu right now.";
        }

        return;

    }

    if (silent && menuOverviewList.querySelector(".price-edit-input")) {
        return;
    }

    if (!hasChanged("menuOverview", data) && silent) {
        return;
    }

    if (!data || data.length === 0) {

        menuOverviewStatus.textContent = "No menu items yet.";
        menuOverviewList.innerHTML = "";
        return;

    }

    menuOverviewStatus.textContent = "";

    renderMenuOverview(data);

}

function renderMenuOverview(items) {

    menuOverviewList.innerHTML = "";

    items.forEach((item) => {

        const row = document.createElement("div");

        row.className = "menu-overview-row";

        renderMenuOverviewDisplayMode(row, item);

        menuOverviewList.appendChild(row);

    });

}

function renderMenuOverviewDisplayMode(row, item) {

    row.innerHTML = "";

    const categoryName = item.categories ? item.categories.category_name : "Uncategorized";

    const info = document.createElement("div");

    info.className = "menu-overview-info";

    info.innerHTML = `
        <span class="menu-overview-name">
            ${item.item_name}
            <span class="availability-pill ${item.availability ? "available" : "unavailable"}">
                ${item.availability ? "Available" : "Not Available"}
            </span>
        </span>
        <span class="menu-overview-meta">${categoryName} · ₱${Number(item.price).toFixed(2)}</span>
    `;

    const actions = document.createElement("div");

    actions.className = "menu-overview-actions";

    const editBtn = document.createElement("button");

    editBtn.className = "category-btn edit";
    editBtn.textContent = "Edit Price";

    editBtn.addEventListener("click", () => {

        renderMenuOverviewEditMode(row, item);

    });

    actions.appendChild(editBtn);

    const deleteBtn = document.createElement("button");

    deleteBtn.className = "category-btn delete";
    deleteBtn.textContent = "Delete";

    deleteBtn.addEventListener("click", () => {

        deleteMenuOverviewItem(item.menu_id, item.item_name, deleteBtn);

    });

    actions.appendChild(deleteBtn);

    row.appendChild(info);
    row.appendChild(actions);

}


/* ==========================================================
   DELETE MENU ITEM (admin)
   Same delete as the employee dashboard's version - permanent,
   safe (order history keeps its item_name/price snapshot via
   order_items even after the menu row and its recipe are gone).
========================================================== */

async function deleteMenuOverviewItem(menuId, itemName, button) {

    const confirmed = window.confirm(

        `Permanently delete "${itemName}"? This also removes its recipe (if any). ` +
        `Past orders that included it are not affected. This cannot be undone.`

    );

    if (!confirmed) {
        return;
    }

    button.disabled = true;

    const { error } = await db

        .from("menu")

        .delete()

        .eq("menu_id", menuId);

    if (error) {

        console.error(error);
        alert("Could not delete this item. Please try again.");
        button.disabled = false;
        return;

    }

    await loadMenuOverview();

}

function renderMenuOverviewEditMode(row, item) {

    row.innerHTML = "";

    const info = document.createElement("div");

    info.className = "menu-overview-info";

    info.innerHTML = `
        <span class="menu-overview-name">${item.item_name}</span>
    `;

    const actions = document.createElement("div");

    actions.className = "menu-overview-actions";

    const priceInput = document.createElement("input");

    priceInput.type = "number";
    priceInput.min = "0";
    priceInput.step = "0.01";
    priceInput.value = item.price;
    priceInput.className = "price-edit-input";

    const saveBtn = document.createElement("button");

    saveBtn.className = "category-btn save";
    saveBtn.textContent = "Save";

    saveBtn.addEventListener("click", () => {

        const newPrice = parseFloat(priceInput.value);

        if (isNaN(newPrice) || newPrice < 0) {

            priceInput.focus();
            return;

        }

        saveMenuPrice(item.menu_id, newPrice, saveBtn);

    });

    const cancelBtn = document.createElement("button");

    cancelBtn.className = "category-btn cancel";
    cancelBtn.textContent = "Cancel";

    cancelBtn.addEventListener("click", () => {

        renderMenuOverviewDisplayMode(row, item);

    });

    actions.appendChild(priceInput);
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);

    row.appendChild(info);
    row.appendChild(actions);

}

async function saveMenuPrice(menuId, newPrice, button) {

    button.disabled = true;

    const { error } = await db

        .from("menu")

        .update({ price: newPrice })

        .eq("menu_id", menuId);

    if (error) {

        console.error(error);
        alert("Could not save the new price. Please try again.");
        button.disabled = false;
        return;

    }

    await loadMenuOverview();

}


/* ==========================================================
   INVENTORY OVERVIEW (read-only)
   Admin can see stock levels and low-stock flags, but has no
   edit controls here - restocking/adding/deleting ingredients
   happens on the employee dashboard, by design.
========================================================== */

async function loadInventoryOverview(silent = false) {

    if (!silent) {
        inventoryStatus.textContent = "Loading inventory...";
    }

    const { data, error } = await db

        .from("ingredients")

        .select("ingredient_id, ingredient_name, unit, stock_quantity, reorder_level")

        .order("stock_quantity", { ascending: true });

    if (error) {

        console.error(error);

        if (!silent) {
            inventoryStatus.textContent = "Could not load inventory right now.";
        }

        return;

    }

    if (!hasChanged("inventoryOverview", data) && silent) {
        return;
    }

    if (!data || data.length === 0) {

        inventoryStatus.textContent = "No ingredients have been added yet.";
        inventoryList.innerHTML = "";
        return;

    }

    inventoryStatus.textContent = "";

    renderInventoryOverview(data);

}

function renderInventoryOverview(items) {

    inventoryList.innerHTML = "";

    items.forEach((item) => {

        const isLow = Number(item.stock_quantity) <= Number(item.reorder_level);

        const row = document.createElement("div");

        row.className = "inventory-row";

        row.innerHTML = `
            <div class="inventory-row-info">
                <span class="inventory-row-name">
                    ${item.ingredient_name}
                    <span class="stock-badge ${isLow ? "low" : "ok"}">
                        ${isLow ? "Low Stock" : "OK"}
                    </span>
                </span>
                <span class="inventory-row-meta">
                    ${Number(item.stock_quantity)} ${item.unit} in stock
                    · warning level: ${Number(item.reorder_level)} ${item.unit}
                </span>
            </div>
        `;

        inventoryList.appendChild(row);

    });

}


/* ==========================================================
   SIDEBAR NAVIGATION
   Shows one content-section at a time, matching the nav-item
   that was clicked. Purely a display toggle - none of the
   data-loading functions above needed to change, since every
   panel's IDs stayed exactly where they were.
========================================================== */

const NAV_TITLES = {

    dashboard: "Dashboard",
    orders: "Orders",
    employees: "Employees",
    customers: "Customers",
    menu: "Menu",
    inventory: "Inventory"

};

document.querySelectorAll(".nav-item").forEach((item) => {

    item.addEventListener("click", () => {

        const section = item.dataset.section;

        document

            .querySelectorAll(".nav-item")

            .forEach((navBtn) => navBtn.classList.remove("active"));

        item.classList.add("active");

        document

            .querySelectorAll(".content-section")

            .forEach((panel) => {

                panel.classList.toggle("active", panel.dataset.section === section);

            });

        const pageTitle = document.getElementById("pageTitle");

        pageTitle.textContent = NAV_TITLES[section] || "Dashboard";

        /* Show fresh data straight away instead of whatever was
           loaded the last time this section was open */

        refreshActiveSection();

    });

});


/* ==========================================================
   LOGOUT
========================================================== */

logoutBtn.addEventListener("click", async () => {

    await db.auth.signOut();
    window.location.href = "admin_login.html";

});


/* ==========================================================
   INIT
========================================================== */

/* ==========================================================
   REFRESH ORDERS (stats + history)
========================================================== */

/* Whichever section is open refreshes itself in the background, so
   no refresh buttons are needed. Hidden sections are skipped (nobody
   is looking at them) and get refreshed the moment they're opened.
   It also pauses while the browser tab is hidden and catches up when
   the admin comes back to it. */

const SECTION_REFRESHERS = {

    dashboard: () => {

        loadOrderStats();
        loadBestSellers(true);
        loadFeedback(true);

    },

    orders: () => {

        loadOrderHistory(true);

    },

    employees: () => {

        loadEmployees(true);

    },

    customers: () => {

        loadCustomers(true);

    },

    menu: () => {

        loadCategories(true);
        loadMenuOverview(true);

    },

    inventory: () => {

        loadInventoryOverview(true);

    }

};

function refreshActiveSection() {

    const activeNav = document.querySelector(".nav-item.active");

    if (!activeNav) {
        return;
    }

    const refresher = SECTION_REFRESHERS[activeNav.dataset.section];

    if (refresher) {
        refresher();
    }

}

setInterval(() => {

    if (!document.hidden) {
        refreshActiveSection();
    }

}, 15000);

document.addEventListener("visibilitychange", () => {

    if (!document.hidden) {
        refreshActiveSection();
    }

});


(async function init() {

    const profile = await requireAdmin();

    if (!profile) {
        return;
    }

    welcomeText.textContent = `Welcome, ${profile.full_name} (Admin)`;

    await loadOrderStats();

    await loadOrderHistory();

    await loadBestSellers();

    await loadFeedback();

    await loadEmployees();

    await loadCustomers();

    await loadCategories();

    await loadMenuOverview();

    await loadInventoryOverview();

})();
