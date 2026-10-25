/* ==========================================================
   EMPLOYEE DASHBOARD
   Coffee Shop Management System
========================================================== */

"use strict";

const db = window.supabaseClient;

/* ==========================================================
   ELEMENTS
========================================================== */

const welcomeText = document.getElementById("welcomeText");
const logoutBtn = document.getElementById("logoutBtn");

const orderFilterTabs = document.getElementById("orderFilterTabs");
const ordersStatus = document.getElementById("ordersStatus");
const ordersQueueList = document.getElementById("ordersQueueList");

const addItemForm = document.getElementById("addItemForm");
const itemName = document.getElementById("itemName");
const itemCategory = document.getElementById("itemCategory");
const itemPrice = document.getElementById("itemPrice");
const itemDescription = document.getElementById("itemDescription");
const itemImage = document.getElementById("itemImage");
const itemImagePreview = document.getElementById("itemImagePreview");

itemImage.addEventListener("change", () => {

    const file = itemImage.files[0];

    if (!file) {

        itemImagePreview.style.display = "none";
        return;

    }

    itemImagePreview.src = URL.createObjectURL(file);
    itemImagePreview.style.display = "block";

});
const addItemBtn = document.getElementById("addItemBtn");
const addItemMessage = document.getElementById("addItemMessage");

const menuStatus = document.getElementById("menuStatus");
const menuList = document.getElementById("menuList");

const addIngredientForm = document.getElementById("addIngredientForm");
const ingredientName = document.getElementById("ingredientName");
const ingredientUnit = document.getElementById("ingredientUnit");
const ingredientStock = document.getElementById("ingredientStock");
const ingredientReorder = document.getElementById("ingredientReorder");
const addIngredientBtn = document.getElementById("addIngredientBtn");
const addIngredientMessage = document.getElementById("addIngredientMessage");

const inventoryStatus = document.getElementById("inventoryStatus");
const inventoryList = document.getElementById("inventoryList");

const recipeMenuSelect = document.getElementById("recipeMenuSelect");
const recipeStatus = document.getElementById("recipeStatus");
const recipeIngredientsList = document.getElementById("recipeIngredientsList");
const addRecipeIngredientForm = document.getElementById("addRecipeIngredientForm");
const recipeIngredientSelect = document.getElementById("recipeIngredientSelect");
const recipeQuantityRequired = document.getElementById("recipeQuantityRequired");
const addRecipeIngredientBtn = document.getElementById("addRecipeIngredientBtn");
const recipeMessage = document.getElementById("recipeMessage");


/* ==========================================================
   MESSAGE HELPERS
========================================================== */

function showAddItemMessage(text, type = "") {

    addItemMessage.textContent = text;
    addItemMessage.className = "";

    if (type !== "") {
        addItemMessage.classList.add(type);
    }

}


/* ==========================================================
   AUTH + ROLE GUARD
   Same idea as employee_login.js - a session alone is not
   enough, the role has to be Admin or Employee. This also
   protects the dashboard if someone bookmarks the URL and
   opens it directly without going through login.
========================================================== */

async function requireStaff() {

    const { data: sessionData, error: sessionError } =
        await db.auth.getSession();

    if (sessionError || !sessionData.session) {

        window.location.href = "employee_login.html";
        return null;

    }

    const user = sessionData.session.user;

    const { data: profile, error: profileError } = await db

        .from("profiles")

        .select("full_name, role")

        .eq("auth_user_id", user.id)

        .single();

    if (profileError || !profile) {

        await db.auth.signOut();
        window.location.href = "employee_login.html";
        return null;

    }

    if (profile.role !== "Admin" && profile.role !== "Employee") {

        await db.auth.signOut();
        window.location.href = "employee_login.html";
        return null;

    }

    return profile;

}


/* ==========================================================
   ORDER QUEUE

   Staff can see all orders (RLS: "Staff can view all orders").
   The customer's name comes from a join through the same FK
   customer_dashboard.js uses in reverse - here we're the ones
   reading someone else's profile, which is fine for staff.
========================================================== */

/* ==========================================================
   BACKGROUND REFRESH HELPERS
   Every list on this page refreshes itself, so these keep that
   from getting in the way: a list is only redrawn when its data
   actually changed, and never while someone is typing into it.
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

function isUserTypingIn(container) {

    const active = document.activeElement;

    if (active && container.contains(active) &&
        ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)) {

        return true;

    }

    return Array.from(container.querySelectorAll("input"))

        .some((input) => input.value !== "");

}

let currentOrderFilter = "active";

const ACTIVE_STATUSES = ["Pending", "Accepted", "Preparing", "Ready"];

const NEXT_STATUS = {

    "Pending": "Accepted",
    "Accepted": "Preparing",
    "Preparing": "Ready",
    "Ready": "Completed"

};

const NEXT_STATUS_LABEL = {

    "Pending": "Accept Order",
    "Accepted": "Start Preparing",
    "Preparing": "Mark Ready",
    "Ready": "Complete Order"

};


orderFilterTabs.addEventListener("click", (event) => {

    const btn = event.target.closest(".filter-tab");

    if (!btn) {
        return;
    }

    currentOrderFilter = btn.dataset.filter;

    document

        .querySelectorAll(".filter-tab")

        .forEach((tab) => tab.classList.remove("active"));

    btn.classList.add("active");

    loadOrders();

});


async function loadOrders(silent = false) {

    if (!silent) {
        ordersStatus.textContent = "Loading orders...";
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

        .order("order_date", { ascending: true });

    if (currentOrderFilter === "active") {

        query = query.in("order_status", ACTIVE_STATUSES);

    } else if (currentOrderFilter !== "all") {

        query = query.eq("order_status", currentOrderFilter);

    }

    const { data, error } = await query;

    if (error) {

        console.error(error);

        if (!silent) {
            ordersStatus.textContent = "Could not load orders right now.";
        }

        return;

    }

    if (!hasChanged("orders:" + currentOrderFilter, data) && silent) {
        return;
    }

    if (!data || data.length === 0) {

        ordersStatus.textContent = "No orders here.";
        ordersQueueList.innerHTML = "";
        return;

    }

    ordersStatus.textContent = "";

    renderOrders(data);

}


function renderOrders(orders) {

    ordersQueueList.innerHTML = "";

    orders.forEach((order) => {

        const card = document.createElement("div");

        card.className = "order-card";

        const customerName = order.profiles
            ? order.profiles.full_name
            : "Unknown customer";

        const itemsSummary = (order.order_items || [])

            .map((it) => `${it.item_name} x${it.quantity}`)

            .join(", ");

        const orderDate = new Date(order.order_date).toLocaleString();

        card.innerHTML = `
            <div class="order-card-top">
                <div>
                    <div class="order-card-id">${customerName} · ${order.order_type}</div>
                    <div class="order-card-customer">${orderDate}</div>
                </div>
                <span class="order-status-badge ${order.order_status}">${order.order_status}</span>
            </div>
            <div class="order-card-items">${itemsSummary || "No items"}</div>
        `;

        const bottom = document.createElement("div");

        bottom.className = "order-card-bottom";

        const totalSpan = document.createElement("span");

        totalSpan.className = "order-card-total";

        totalSpan.textContent =
            `Payment: ${order.payment_status} · ₱${Number(order.total_amount).toFixed(2)}`;

        bottom.appendChild(totalSpan);

        const actions = document.createElement("div");

        actions.className = "order-card-actions";

        const nextStatus = NEXT_STATUS[order.order_status];

        if (nextStatus) {

            const advanceBtn = document.createElement("button");

            advanceBtn.className = "order-action-btn advance";
            advanceBtn.textContent = NEXT_STATUS_LABEL[order.order_status];

            advanceBtn.addEventListener("click", () => {

                updateOrderStatus(order.order_id, nextStatus, advanceBtn);

            });

            actions.appendChild(advanceBtn);

        }

        if (order.order_status !== "Completed" && order.order_status !== "Cancelled") {

            const cancelBtn = document.createElement("button");

            cancelBtn.className = "order-action-btn cancel";
            cancelBtn.textContent = "Cancel";

            cancelBtn.addEventListener("click", () => {

                const confirmed = window.confirm("Cancel this order?");

                if (confirmed) {

                    updateOrderStatus(order.order_id, "Cancelled", cancelBtn);

                }

            });

            actions.appendChild(cancelBtn);

        }

        bottom.appendChild(actions);

        card.appendChild(bottom);

        ordersQueueList.appendChild(card);

    });

}


async function updateOrderStatus(orderId, newStatus, button) {

    button.disabled = true;

    const { error } = await db

        .from("orders")

        .update({ order_status: newStatus })

        .eq("order_id", orderId);

    if (error) {

        console.error(error);
        button.disabled = false;
        return;

    }

    await loadOrders();

}


/* ==========================================================
   LOAD CATEGORIES (for the dropdown)
========================================================== */

async function loadCategories(silent = false) {

    const { data, error } = await db

        .from("categories")

        .select("category_id, category_name")

        .order("category_name", { ascending: true });

    if (error) {

        console.error(error);
        return;

    }

    if (!hasChanged("categories", data) && silent) {
        return;
    }

    const previousCategory = itemCategory.value;

    itemCategory.innerHTML = '<option value="">Select category...</option>';

    if (!data || data.length === 0) {

        itemCategory.innerHTML +=
            '<option value="" disabled>No categories yet - add one in Supabase first</option>';

        return;

    }

    data.forEach((cat) => {

        const option = document.createElement("option");

        option.value = cat.category_id;
        option.textContent = cat.category_name;

        itemCategory.appendChild(option);

    });

    /* Keep whatever the employee had already picked in the form */

    if (previousCategory) {
        itemCategory.value = previousCategory;
    }

}


/* ==========================================================
   LOAD MENU LIST
========================================================== */

async function loadMenu(silent = false) {

    if (!silent) {
        menuStatus.textContent = "Loading menu...";
    }

    const { data, error } = await db

        .from("menu")

        .select("menu_id, item_name, price, availability, categories(category_name)")

        .order("item_name", { ascending: true });

    if (error) {

        console.error(error);

        if (!silent) {
            menuStatus.textContent = "Could not load the menu right now.";
        }

        return;

    }

    if (!hasChanged("menu", data) && silent) {
        return;
    }

    if (!data || data.length === 0) {

        menuStatus.textContent = "No menu items yet. Add one above.";
        menuList.innerHTML = "";
        return;

    }

    menuStatus.textContent = "";

    renderMenu(data);

}


/* ==========================================================
   RENDER MENU LIST
========================================================== */

function renderMenu(items) {

    menuList.innerHTML = "";

    items.forEach((item) => {

        const row = document.createElement("div");

        row.className = "menu-row";

        const categoryName = item.categories
            ? item.categories.category_name
            : "Uncategorized";

        row.innerHTML = `
            <div class="menu-row-info">
                <span class="menu-row-name">${item.item_name}</span>
                <span class="menu-row-meta">${categoryName} · ₱${Number(item.price).toFixed(2)}</span>
            </div>
        `;

        const toggleBtn = document.createElement("button");

        toggleBtn.className = "availability-toggle " +
            (item.availability ? "available" : "unavailable");

        toggleBtn.textContent = item.availability
            ? "Available"
            : "Not Available";

        toggleBtn.addEventListener("click", () => {

            /* Read the CURRENT state from the button itself - item.availability
               is only what it was when the page loaded, so using it made every
               click after the first one send the same value again */

            const isCurrentlyAvailable = toggleBtn.classList.contains("available");

            toggleAvailability(item.menu_id, !isCurrentlyAvailable, toggleBtn);

        });

        const deleteBtn = document.createElement("button");

        deleteBtn.className = "delete-menu-btn";
        deleteBtn.textContent = "Delete";

        deleteBtn.addEventListener("click", () => {

            deleteMenuItem(item.menu_id, item.item_name, deleteBtn);

        });

        const actions = document.createElement("div");

        actions.className = "menu-row-actions";

        actions.appendChild(toggleBtn);
        actions.appendChild(deleteBtn);

        row.appendChild(actions);

        menuList.appendChild(row);

    });

}


/* ==========================================================
   DELETE MENU ITEM
   Safe to delete permanently: order_items.menu_id is ON DELETE
   SET NULL (past orders keep their item_name/price snapshot
   and stay intact), and menu_ingredients.menu_id is ON DELETE
   CASCADE (its recipe just goes away with it) - so this never
   fails with a foreign key error, unlike deleting a category.
========================================================== */

async function deleteMenuItem(menuId, itemName, button) {

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

    await loadMenu();

    await loadRecipeMenuOptions();

}


/* ==========================================================
   TOGGLE AVAILABILITY
   This is the switch the customer dashboard's menu query
   is watching - flipping this updates what customers see
   the next time they load their menu.
========================================================== */

async function toggleAvailability(menuId, newValue, button) {

    button.disabled = true;

    const { error } = await db

        .from("menu")

        .update({ availability: newValue })

        .eq("menu_id", menuId);

    if (error) {

        console.error(error);
        alert("Could not change availability. Please try again.");
        button.disabled = false;
        return;

    }

    button.className = "availability-toggle " +
        (newValue ? "available" : "unavailable");

    button.textContent = newValue ? "Available" : "Not Available";

    button.disabled = false;

}


/* ==========================================================
   ADD NEW ITEM
========================================================== */

function setAddItemLoading(isLoading) {

    if (isLoading) {

        addItemBtn.disabled = true;
        addItemBtn.dataset.originalText = addItemBtn.textContent;
        addItemBtn.textContent = "Adding...";

    } else {

        addItemBtn.disabled = false;
        addItemBtn.textContent = addItemBtn.dataset.originalText || "Add Item";

    }

}

function validateAddItemForm() {

    showAddItemMessage("");

    if (itemName.value.trim() === "") {

        showAddItemMessage("Please enter an item name.", "error");
        itemName.focus();
        return false;

    }

    if (itemCategory.value === "") {

        showAddItemMessage("Please select a category.", "error");
        itemCategory.focus();
        return false;

    }

    const priceValue = parseFloat(itemPrice.value);

    if (isNaN(priceValue) || priceValue < 0) {

        showAddItemMessage("Please enter a valid price.", "error");
        itemPrice.focus();
        return false;

    }

    return true;

}

async function addMenuItem() {

    setAddItemLoading(true);

    try {

        /* Step 1: upload the photo to Storage first, if one was
           picked - we need the resulting public URL before we
           can insert the menu row */

        let imageUrl = null;

        const file = itemImage.files[0];

        if (file) {

            const filePath = `${Date.now()}_${file.name}`;

            const { error: uploadError } = await db

                .storage

                .from("menu-images")

                .upload(filePath, file);

            if (uploadError) {

                console.error(uploadError);

                showAddItemMessage(

                    "Could not upload the photo. Please try again.",

                    "error"

                );

                return;

            }

            const { data: publicUrlData } = db

                .storage

                .from("menu-images")

                .getPublicUrl(filePath);

            imageUrl = publicUrlData.publicUrl;

        }

        /* Step 2: insert the menu item, using the uploaded
           image's URL if there is one */

        const { error } = await db

            .from("menu")

            .insert({

                item_name: itemName.value.trim(),
                category_id: itemCategory.value,
                price: parseFloat(itemPrice.value),
                description: itemDescription.value.trim() || null,
                image_url: imageUrl,
                availability: true

            });

        if (error) {

            console.error(error);

            const lower = error.message.toLowerCase();

            if (lower.includes("duplicate") || lower.includes("unique")) {

                showAddItemMessage(

                    "An item with this name already exists in that category.",

                    "error"

                );

            } else {

                showAddItemMessage(

                    "Could not add the item. Please try again.",

                    "error"

                );

            }

            return;

        }

        showAddItemMessage("Item added successfully!", "success");

        addItemForm.reset();

        itemImagePreview.style.display = "none";

        await loadMenu();

        await loadRecipeMenuOptions();

    } catch (err) {

        console.error(err);
        showAddItemMessage("Unexpected error. Please try again.", "error");

    } finally {

        setAddItemLoading(false);

    }

}

addItemForm.addEventListener("submit", (event) => {

    event.preventDefault();

    if (!validateAddItemForm()) {
        return;
    }

    addMenuItem();

});


/* ==========================================================
   INVENTORY - LOAD
========================================================== */

async function loadInventory(silent = false) {

    if (!silent) {
        inventoryStatus.textContent = "Loading inventory...";
    }

    const { data, error } = await db

        .from("ingredients")

        .select("ingredient_id, ingredient_name, unit, stock_quantity, reorder_level")

        .order("ingredient_name", { ascending: true });

    if (error) {

        console.error(error);

        if (!silent) {
            inventoryStatus.textContent = "Could not load inventory right now.";
        }

        return;

    }

    /* Skip (without recording) while a restock amount is being typed,
       so it gets picked up on the next refresh instead of wiping it */

    if (silent && isUserTypingIn(inventoryList)) {
        return;
    }

    if (!hasChanged("inventory", data) && silent) {
        return;
    }

    if (!data || data.length === 0) {

        inventoryStatus.textContent = "No ingredients yet. Add one above.";
        inventoryList.innerHTML = "";
        return;

    }

    inventoryStatus.textContent = "";

    renderInventory(data);

}


/* ==========================================================
   INVENTORY - RENDER
========================================================== */

function renderInventory(items) {

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

        const actions = document.createElement("div");

        actions.className = "inventory-actions";

        const restockInput = document.createElement("input");

        restockInput.type = "number";
        restockInput.min = "0";
        restockInput.step = "0.01";
        restockInput.placeholder = "Qty";
        restockInput.className = "restock-input";

        const restockBtn = document.createElement("button");

        restockBtn.className = "restock-btn";
        restockBtn.textContent = "Restock";

        restockBtn.addEventListener("click", () => {

            const amount = parseFloat(restockInput.value);

            if (isNaN(amount) || amount <= 0) {

                restockInput.focus();
                return;

            }

            restockIngredient(

                item.ingredient_id,

                Number(item.stock_quantity) + amount,

                restockBtn,

                restockInput

            );

        });

        const deleteBtn = document.createElement("button");

        deleteBtn.className = "delete-ingredient-btn";
        deleteBtn.textContent = "Delete";

        deleteBtn.addEventListener("click", () => {

            deleteIngredient(item.ingredient_id, item.ingredient_name, deleteBtn);

        });

        actions.appendChild(restockInput);
        actions.appendChild(restockBtn);
        actions.appendChild(deleteBtn);

        row.appendChild(actions);

        inventoryList.appendChild(row);

    });

}


/* ==========================================================
   INVENTORY - RESTOCK
   Adds the amount the employee just bought on top of whatever
   is currently in stock (newTotal is calculated in the caller
   from the value already on screen).
========================================================== */

async function restockIngredient(ingredientId, newTotal, button, input) {

    button.disabled = true;

    const { error } = await db

        .from("ingredients")

        .update({ stock_quantity: newTotal })

        .eq("ingredient_id", ingredientId);

    if (error) {

        console.error(error);
        button.disabled = false;
        return;

    }

    input.value = "";

    await loadInventory();

}


/* ==========================================================
   INVENTORY - DELETE
   If this ingredient is used in a menu item's recipe, the
   database will refuse the delete (ON DELETE RESTRICT) rather
   than silently breaking that menu item's recipe.
========================================================== */

async function deleteIngredient(ingredientId, name, button) {

    const confirmed = window.confirm(`Delete "${name}" from inventory?`);

    if (!confirmed) {
        return;
    }

    button.disabled = true;

    const { error } = await db

        .from("ingredients")

        .delete()

        .eq("ingredient_id", ingredientId);

    if (error) {

        console.error(error);

        const lower = error.message.toLowerCase();

        if (lower.includes("violates foreign key")) {

            alert(`"${name}" is used in a menu item's recipe and cannot be deleted.`);

        } else {

            alert("Could not delete this ingredient. Please try again.");

        }

        button.disabled = false;
        return;

    }

    await loadInventory();

}


/* ==========================================================
   INVENTORY - ADD NEW INGREDIENT
========================================================== */

function showAddIngredientMessage(text, type = "") {

    addIngredientMessage.textContent = text;
    addIngredientMessage.className = "";

    if (type !== "") {
        addIngredientMessage.classList.add(type);
    }

}

function setAddIngredientLoading(isLoading) {

    if (isLoading) {

        addIngredientBtn.disabled = true;
        addIngredientBtn.dataset.originalText = addIngredientBtn.textContent;
        addIngredientBtn.textContent = "Adding...";

    } else {

        addIngredientBtn.disabled = false;
        addIngredientBtn.textContent = addIngredientBtn.dataset.originalText || "Add Ingredient";

    }

}

function validateAddIngredientForm() {

    showAddIngredientMessage("");

    if (ingredientName.value.trim() === "") {

        showAddIngredientMessage("Please enter an ingredient name.", "error");
        ingredientName.focus();
        return false;

    }

    if (ingredientUnit.value === "") {

        showAddIngredientMessage("Please select a unit.", "error");
        ingredientUnit.focus();
        return false;

    }

    const stockValue = parseFloat(ingredientStock.value);

    if (isNaN(stockValue) || stockValue < 0) {

        showAddIngredientMessage("Please enter a valid starting stock amount.", "error");
        ingredientStock.focus();
        return false;

    }

    const reorderValue = parseFloat(ingredientReorder.value);

    if (isNaN(reorderValue) || reorderValue < 0) {

        showAddIngredientMessage("Please enter a valid warning level.", "error");
        ingredientReorder.focus();
        return false;

    }

    return true;

}

async function addIngredient() {

    setAddIngredientLoading(true);

    try {

        const { error } = await db

            .from("ingredients")

            .insert({

                ingredient_name: ingredientName.value.trim(),
                unit: ingredientUnit.value,
                stock_quantity: parseFloat(ingredientStock.value),
                reorder_level: parseFloat(ingredientReorder.value)

            });

        if (error) {

            console.error(error);

            const lower = error.message.toLowerCase();

            if (lower.includes("duplicate") || lower.includes("unique")) {

                showAddIngredientMessage(

                    "An ingredient with this name already exists.",

                    "error"

                );

            } else {

                showAddIngredientMessage(

                    "Could not add the ingredient. Please try again.",

                    "error"

                );

            }

            return;

        }

        showAddIngredientMessage("Ingredient added successfully!", "success");

        addIngredientForm.reset();

        await loadInventory();

        await loadRecipeIngredientOptions();

    } catch (err) {

        console.error(err);
        showAddIngredientMessage("Unexpected error. Please try again.", "error");

    } finally {

        setAddIngredientLoading(false);

    }

}

addIngredientForm.addEventListener("submit", (event) => {

    event.preventDefault();

    if (!validateAddIngredientForm()) {
        return;
    }

    addIngredient();

});


/* ==========================================================
   RECIPES

   Lets an employee say "Mocha uses 18g coffee beans + 200ml
   milk" - each row here is one entry in menu_ingredients.
   The deduct_ingredient_stock() trigger (run separately in
   SQL Editor) reads this same table to know what to subtract
   from inventory when an order comes in.
========================================================== */

async function loadRecipeMenuOptions(silent = false) {

    const { data, error } = await db

        .from("menu")

        .select("menu_id, item_name")

        .order("item_name", { ascending: true });

    if (error) {

        console.error(error);
        return;

    }

    if (!hasChanged("recipeMenuOptions", data) && silent) {
        return;
    }

    const previousSelection = recipeMenuSelect.value;

    recipeMenuSelect.innerHTML = '<option value="">Select a menu item...</option>';

    (data || []).forEach((item) => {

        const option = document.createElement("option");

        option.value = item.menu_id;
        option.textContent = item.item_name;

        recipeMenuSelect.appendChild(option);

    });

    /* Keep the employee's selection. If that menu item no longer
       exists (someone deleted it), clear the recipe list as well. */

    if (previousSelection) {

        recipeMenuSelect.value = previousSelection;

        if (recipeMenuSelect.value !== previousSelection) {

            recipeIngredientsList.innerHTML = "";
            recipeStatus.textContent = "Select a menu item to see or edit its recipe.";

        }

    }

}

async function loadRecipeIngredientOptions(silent = false) {

    const { data, error } = await db

        .from("ingredients")

        .select("ingredient_id, ingredient_name, unit")

        .order("ingredient_name", { ascending: true });

    if (error) {

        console.error(error);
        return;

    }

    if (!hasChanged("recipeIngredientOptions", data) && silent) {
        return;
    }

    const previousIngredient = recipeIngredientSelect.value;

    recipeIngredientSelect.innerHTML = '<option value="">Select ingredient...</option>';

    if (!data || data.length === 0) {

        recipeIngredientSelect.innerHTML +=
            '<option value="" disabled>No ingredients yet - add one above first</option>';

        return;

    }

    data.forEach((ing) => {

        const option = document.createElement("option");

        option.value = ing.ingredient_id;
        option.textContent = `${ing.ingredient_name} (${ing.unit})`;

        recipeIngredientSelect.appendChild(option);

    });

    if (previousIngredient) {
        recipeIngredientSelect.value = previousIngredient;
    }

}

recipeMenuSelect.addEventListener("change", () => {

    const menuId = recipeMenuSelect.value;

    if (menuId === "") {

        recipeIngredientsList.innerHTML = "";
        recipeStatus.textContent = "Select a menu item to see or edit its recipe.";
        return;

    }

    loadRecipeForMenuItem(menuId);

});

async function loadRecipeForMenuItem(menuId, silent = false) {

    if (!silent) {
        recipeStatus.textContent = "Loading recipe...";
    }

    const { data, error } = await db

        .from("menu_ingredients")

        .select("menu_ingredient_id, quantity_required, ingredients(ingredient_id, ingredient_name, unit)")

        .eq("menu_id", menuId);

    if (error) {

        console.error(error);

        if (!silent) {
            recipeStatus.textContent = "Could not load this item's recipe.";
        }

        return;

    }

    if (!hasChanged("recipe:" + menuId, data) && silent) {
        return;
    }

    if (!data || data.length === 0) {

        recipeStatus.textContent = "No ingredients assigned yet - add some below.";
        recipeIngredientsList.innerHTML = "";
        return;

    }

    recipeStatus.textContent = "";

    renderRecipe(data);

}

function renderRecipe(rows) {

    recipeIngredientsList.innerHTML = "";

    rows.forEach((row) => {

        const ingredient = row.ingredients;

        const rowEl = document.createElement("div");

        rowEl.className = "recipe-ingredient-row";

        rowEl.innerHTML = `
            <div>
                <span class="recipe-ingredient-name">${ingredient.ingredient_name}</span>
                <span class="recipe-ingredient-qty"> - ${row.quantity_required} ${ingredient.unit} per order</span>
            </div>
        `;

        const removeBtn = document.createElement("button");

        removeBtn.className = "recipe-remove-btn";
        removeBtn.textContent = "Remove";

        removeBtn.addEventListener("click", () => {

            removeRecipeIngredient(row.menu_ingredient_id, removeBtn);

        });

        rowEl.appendChild(removeBtn);

        recipeIngredientsList.appendChild(rowEl);

    });

}

async function removeRecipeIngredient(menuIngredientId, button) {

    button.disabled = true;

    const { error } = await db

        .from("menu_ingredients")

        .delete()

        .eq("menu_ingredient_id", menuIngredientId);

    if (error) {

        console.error(error);
        button.disabled = false;
        return;

    }

    await loadRecipeForMenuItem(recipeMenuSelect.value);

}

function showRecipeMessage(text, type = "") {

    recipeMessage.textContent = text;
    recipeMessage.className = "";

    if (type !== "") {
        recipeMessage.classList.add(type);
    }

}

function setRecipeLoading(isLoading) {

    if (isLoading) {

        addRecipeIngredientBtn.disabled = true;
        addRecipeIngredientBtn.dataset.originalText = addRecipeIngredientBtn.textContent;
        addRecipeIngredientBtn.textContent = "Adding...";

    } else {

        addRecipeIngredientBtn.disabled = false;
        addRecipeIngredientBtn.textContent = addRecipeIngredientBtn.dataset.originalText || "Add to Recipe";

    }

}

addRecipeIngredientForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    showRecipeMessage("");

    const menuId = recipeMenuSelect.value;

    if (menuId === "") {

        showRecipeMessage("Please select a menu item first.", "error");
        return;

    }

    if (recipeIngredientSelect.value === "") {

        showRecipeMessage("Please select an ingredient.", "error");
        return;

    }

    const qtyValue = parseFloat(recipeQuantityRequired.value);

    if (isNaN(qtyValue) || qtyValue <= 0) {

        showRecipeMessage("Please enter a valid amount.", "error");
        recipeQuantityRequired.focus();
        return;

    }

    setRecipeLoading(true);

    try {

        const { error } = await db

            .from("menu_ingredients")

            .insert({

                menu_id: menuId,

                ingredient_id: recipeIngredientSelect.value,

                quantity_required: qtyValue

            });

        if (error) {

            console.error(error);

            const lower = error.message.toLowerCase();

            if (lower.includes("duplicate") || lower.includes("unique")) {

                showRecipeMessage(

                    "This ingredient is already in the recipe - remove it first to change the amount.",

                    "error"

                );

            } else {

                showRecipeMessage("Could not add this ingredient. Please try again.", "error");

            }

            return;

        }

        showRecipeMessage("Added to recipe!", "success");

        addRecipeIngredientForm.reset();

        await loadRecipeForMenuItem(menuId);

    } catch (err) {

        console.error(err);
        showRecipeMessage("Unexpected error. Please try again.", "error");

    } finally {

        setRecipeLoading(false);

    }

});


/* ==========================================================
   LOGOUT
========================================================== */

logoutBtn.addEventListener("click", async () => {

    await db.auth.signOut();
    window.location.href = "employee_login.html";

});


/* ==========================================================
   INIT
========================================================== */

/* ==========================================================
   REFRESH ORDER QUEUE
   New orders need to show up promptly for staff, so this
   polls more often than the customer/admin pages do.
========================================================== */

/* Everything on this page updates itself in the background, so no
   refresh button is needed. The order queue checks most often since
   new orders need to be noticed quickly; the rest (menu, inventory,
   recipes) changes less often. Both pause while the browser tab is
   hidden and catch up the moment the employee comes back to it. */

function refreshOrderQueue() {

    loadOrders(true);

}

async function refreshEverythingElse() {

    loadMenu(true);

    loadInventory(true);

    loadCategories(true);

    /* menu options first, so the recipe list below is only
       reloaded if that menu item is still there */

    await loadRecipeMenuOptions(true);

    loadRecipeIngredientOptions(true);

    if (recipeMenuSelect.value) {
        loadRecipeForMenuItem(recipeMenuSelect.value, true);
    }

}

setInterval(() => {

    if (!document.hidden) {
        refreshOrderQueue();
    }

}, 10000);

setInterval(() => {

    if (!document.hidden) {
        refreshEverythingElse();
    }

}, 20000);

document.addEventListener("visibilitychange", () => {

    if (!document.hidden) {

        refreshOrderQueue();
        refreshEverythingElse();

    }

});


(async function init() {

    const profile = await requireStaff();

    if (!profile) {
        return;
    }

    welcomeText.textContent = `Welcome, ${profile.full_name} (${profile.role})`;

    await loadOrders();

    await loadCategories();

    await loadMenu();

    await loadInventory();

    await loadRecipeMenuOptions();

    await loadRecipeIngredientOptions();

})();
