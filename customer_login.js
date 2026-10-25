/* ==========================================================
   CUSTOMER LOGIN
   Coffee Shop Management System
========================================================== */

"use strict";

/* ==========================================================
   GET SUPABASE CLIENT
========================================================== */

const db = window.supabaseClient;

/* ==========================================================
   GET FORM ELEMENTS
========================================================== */

const loginForm = document.getElementById("loginForm");

const email = document.getElementById("email");

const password = document.getElementById("password");

const submitBtn = document.getElementById("submitBtn");

const message = document.getElementById("message");

const togglePassword =
    document.getElementById("togglePassword");


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

togglePassword.addEventListener("click", () => {

    if (password.type === "password") {

        password.type = "text";

        togglePassword.textContent = "Hide";

    } else {

        password.type = "password";

        togglePassword.textContent = "Show";

    }

});


/* ==========================================================
   VALID EMAIL
========================================================== */

function isValidEmail(emailAddress) {

    const regex =

        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return regex.test(emailAddress);

}


/* ==========================================================
   VALIDATE FORM
========================================================== */

function validateForm() {

    clearMessage();

    if (!isValidEmail(email.value.trim())) {

        showMessage(

            "Please enter a valid email address.",

            "error"

        );

        email.focus();

        return false;

    }

    if (password.value.trim() === "") {

        showMessage(

            "Please enter your password.",

            "error"

        );

        password.focus();

        return false;

    }

    return true;

}


/* ==========================================================
   FRIENDLY ERROR MESSAGES
========================================================== */

function getFriendlyLoginError(error) {

    const raw = (error && error.message) ? error.message : "";

    const lower = raw.toLowerCase();

    if (lower.includes("invalid login credentials")) {

        return "Incorrect email or password. Please try again.";

    }

    if (lower.includes("email not confirmed")) {

        return "Please confirm your email address before logging in. Check your inbox.";

    }

    if (lower.includes("network") ||
        lower.includes("fetch")) {

        return "Network error. Please check your connection and try again.";

    }

    return "Something went wrong while logging in. Please try again.";

}


/* ==========================================================
   SET LOADING STATE
========================================================== */

function setSubmitLoading(isLoading) {

    if (isLoading) {

        submitBtn.disabled = true;

        submitBtn.dataset.originalText = submitBtn.textContent;

        submitBtn.textContent = "Logging in...";

    } else {

        submitBtn.disabled = false;

        submitBtn.textContent =
            submitBtn.dataset.originalText || "Login";

    }

}


/* ==========================================================
   LOGIN CUSTOMER
========================================================== */

async function loginCustomer() {

    const emailValue = email.value.trim();

    const passwordValue = password.value;

    setSubmitLoading(true);

    try {

        const { data, error } = await db.auth.signInWithPassword({

            email: emailValue,

            password: passwordValue

        });

        if (error) {

            showMessage(getFriendlyLoginError(error), "error");

            return;

        }

        /* Check the account isn't blocked - a valid password
           doesn't mean the account is allowed to sign in */

        const { data: profile, error: profileError } = await db

            .from("profiles")

            .select("status")

            .eq("auth_user_id", data.user.id)

            .single();

        if (profileError || !profile) {

            await db.auth.signOut();

            showMessage(

                "Could not verify your account. Please try again.",

                "error"

            );

            return;

        }

        if (profile.status !== "Active") {

            await db.auth.signOut();

            showMessage(

                "This account has been blocked. Please contact the shop for help.",

                "error"

            );

            return;

        }

        showMessage(

            "Login successful! Redirecting...",

            "success"

        );

        setTimeout(() => {

            window.location.href = "customer_dashboard.html";

        }, 1200);

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

loginForm.addEventListener("submit", function (event) {

    event.preventDefault();

    if (!validateForm()) {
        return;
    }

    loginCustomer();

});
