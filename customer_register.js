/* ==========================================================
   CUSTOMER REGISTER
   Coffee Shop Management System
   Part 1 - Form Validation & UI
========================================================== */

"use strict";

/* ==========================================================
   GET SUPABASE CLIENT
========================================================== */

const db = window.supabaseClient;

/* ==========================================================
   GET FORM ELEMENTS
========================================================== */

const registerForm = document.getElementById("registerForm");

const fullName = document.getElementById("fullName");

const email = document.getElementById("email");

const phone = document.getElementById("phone");

const password = document.getElementById("password");

const confirmPassword = document.getElementById("confirmPassword");

const terms = document.getElementById("terms");

const submitBtn = document.getElementById("submitBtn");

const message = document.getElementById("message");

const passwordStrength =
    document.getElementById("passwordStrength");

const togglePassword =
    document.getElementById("togglePassword");

const toggleConfirm =
    document.getElementById("toggleConfirm");


/* ==========================================================
   SHOW MESSAGE
========================================================== */

function showMessage(text, type = "") {

    message.textContent = text;

    message.className = "";

    if (type !== "") {

        message.classList.add(type);

    }

}


/* ==========================================================
   CLEAR MESSAGE
========================================================== */

function clearMessage() {

    showMessage("");

}


/* ==========================================================
   TOGGLE PASSWORD
========================================================== */

function togglePasswordVisibility(button, input) {

    if (input.type === "password") {

        input.type = "text";

        button.textContent = "Hide";

    }

    else {

        input.type = "password";

        button.textContent = "Show";

    }

}

togglePassword.addEventListener("click", () => {

    togglePasswordVisibility(togglePassword, password);

});

toggleConfirm.addEventListener("click", () => {

    togglePasswordVisibility(toggleConfirm, confirmPassword);

});


/* ==========================================================
   PASSWORD STRENGTH
========================================================== */

function updatePasswordStrength() {

    const value = password.value;

    let strength = 0;

    if (value.length >= 8)
        strength++;

    if (/[A-Z]/.test(value))
        strength++;

    if (/[a-z]/.test(value))
        strength++;

    if (/[0-9]/.test(value))
        strength++;

    if (/[^A-Za-z0-9]/.test(value))
        strength++;

    switch (strength) {

        case 0:
        case 1:

            passwordStrength.textContent = "Weak Password";

            passwordStrength.style.color = "darkred";

            break;

        case 2:
        case 3:

            passwordStrength.textContent = "Medium Password";

            passwordStrength.style.color = "darkorange";

            break;

        case 4:

            passwordStrength.textContent = "Strong Password";

            passwordStrength.style.color = "green";

            break;

        case 5:

            passwordStrength.textContent = "Very Strong Password";

            passwordStrength.style.color = "darkgreen";

            break;

    }

}

password.addEventListener("input", updatePasswordStrength);


/* ==========================================================
   VALID EMAIL
========================================================== */

function isValidEmail(emailAddress) {

    const regex =

        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return regex.test(emailAddress);

}


/* ==========================================================
   VALID PHILIPPINE PHONE
========================================================== */

function isValidPhone(number) {

    if (number.trim() === "") {

        return true;

    }

    const regex =

        /^(09|\+639)\d{9}$/;

    return regex.test(number);

}


/* ==========================================================
   VALIDATE FORM
========================================================== */

function validateForm() {

    clearMessage();

    if (fullName.value.trim() === "") {

        showMessage(

            "Please enter your full name.",

            "error"

        );

        fullName.focus();

        return false;

    }

    if (!isValidEmail(email.value.trim())) {

        showMessage(

            "Please enter a valid email address.",

            "error"

        );

        email.focus();

        return false;

    }

    if (!isValidPhone(phone.value.trim())) {

        showMessage(

            "Invalid Philippine phone number.",

            "error"

        );

        phone.focus();

        return false;

    }

    if (password.value.length < 8) {

        showMessage(

            "Password must contain at least 8 characters.",

            "error"

        );

        password.focus();

        return false;

    }

    if (password.value !== confirmPassword.value) {

        showMessage(

            "Passwords do not match.",

            "error"

        );

        confirmPassword.focus();

        return false;

    }

    if (!terms.checked) {

        showMessage(

            "Please accept the Terms and Conditions.",

            "error"

        );

        return false;

    }

    return true;

}
/* ==========================================================
   PART 2 - SUPABASE SIGNUP
========================================================== */

/* ----------------------------------------------------------
   FRIENDLY ERROR MESSAGES
   Supabase returns technical error text - map the common
   ones to messages a customer will actually understand.
---------------------------------------------------------- */

function getFriendlySignupError(error) {

    const raw = (error && error.message) ? error.message : "";

    const lower = raw.toLowerCase();

    if (lower.includes("already registered") ||
        lower.includes("already exists") ||
        lower.includes("user already")) {

        return "An account with this email already exists. Please login instead.";

    }

    if (lower.includes("password")) {

        return "Password does not meet the requirements. Please choose a stronger password.";

    }

    if (lower.includes("email")) {

        return "Please enter a valid email address.";

    }

    if (lower.includes("network") ||
        lower.includes("fetch")) {

        return "Network error. Please check your connection and try again.";

    }

    return "Something went wrong while creating your account. Please try again.";

}


/* ----------------------------------------------------------
   SET LOADING STATE
   Disables the button and swaps its label so the user
   cannot double-submit while the request is in flight.
---------------------------------------------------------- */

function setSubmitLoading(isLoading) {

    if (isLoading) {

        submitBtn.disabled = true;

        submitBtn.dataset.originalText = submitBtn.textContent;

        submitBtn.textContent = "Registering...";

    } else {

        submitBtn.disabled = false;

        submitBtn.textContent =
            submitBtn.dataset.originalText || "Register";

    }

}


/* ----------------------------------------------------------
   REGISTER CUSTOMER
   Creates the auth user in Supabase. full_name and phone are
   passed in as user metadata - the "handle_new_user" trigger
   on the database reads that metadata and creates the matching
   row in public.profiles automatically. No manual insert is
   needed (or possible - RLS only allows Admins to insert
   profiles directly, on purpose).
---------------------------------------------------------- */

async function registerCustomer() {

    const fullNameValue = fullName.value.trim();

    const emailValue = email.value.trim();

    const phoneValue = phone.value.trim();

    const passwordValue = password.value;

    setSubmitLoading(true);

    try {

        /* Create the auth user - the "phone" key here must match
           NEW.raw_user_meta_data ->> 'phone' inside
           handle_new_user() in your SQL */

        const { error } = await db.auth.signUp({

            email: emailValue,

            password: passwordValue,

            options: {

                data: {

                    full_name: fullNameValue,

                    phone: phoneValue

                }

            }

        });

        if (error) {

            showMessage(getFriendlySignupError(error), "error");

            return;

        }

        /* Success - the profile row already exists by now,
           created server-side by the trigger */

        showMessage(

            "Registration successful! Please check your email to confirm your account.",

            "success"

        );

        registerForm.reset();

        passwordStrength.textContent = "";

        setTimeout(() => {

            window.location.href = "customer_login.html";

        }, 2000);

    } catch (err) {

        console.error(err);

        showMessage(

            "Unexpected error. Please try again later.",

            "error"

        );

    } finally {

        setSubmitLoading(false);

    }

}


/* ==========================================================
   FORM SUBMIT
========================================================== */

registerForm.addEventListener("submit", function (event) {

    event.preventDefault();

    if (!validateForm()) {
        return;
    }

    registerCustomer();

});