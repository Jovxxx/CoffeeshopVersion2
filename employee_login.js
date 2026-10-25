/* ==========================================================
   EMPLOYEE LOGIN
   Coffee Shop Management System

   Difference from customer login: after a successful
   signInWithPassword, we check profiles.role. Only 'Admin'
   or 'Employee' may proceed - a Customer who happens to
   know this URL gets signed back out immediately.
========================================================== */

"use strict";

const db = window.supabaseClient;

const loginForm = document.getElementById("loginForm");
const email = document.getElementById("email");
const password = document.getElementById("password");
const submitBtn = document.getElementById("submitBtn");
const message = document.getElementById("message");
const togglePassword = document.getElementById("togglePassword");


function showMessage(text, type = "") {

    message.textContent = text;
    message.className = "";

    if (type !== "") {
        message.classList.add(type);
    }

}

function clearMessage() {
    showMessage("");
}

togglePassword.addEventListener("click", () => {

    if (password.type === "password") {

        password.type = "text";
        togglePassword.textContent = "Hide";

    } else {

        password.type = "password";
        togglePassword.textContent = "Show";

    }

});


function isValidEmail(value) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

}


function validateForm() {

    clearMessage();

    if (!isValidEmail(email.value.trim())) {

        showMessage("Please enter a valid email address.", "error");
        email.focus();
        return false;

    }

    if (password.value.trim() === "") {

        showMessage("Please enter your password.", "error");
        password.focus();
        return false;

    }

    return true;

}


function getFriendlyLoginError(error) {

    const lower = ((error && error.message) || "").toLowerCase();

    if (lower.includes("invalid login credentials")) {
        return "Incorrect email or password. Please try again.";
    }

    if (lower.includes("email not confirmed")) {
        return "Please confirm your email address before logging in.";
    }

    return "Something went wrong while logging in. Please try again.";

}


function setSubmitLoading(isLoading) {

    if (isLoading) {

        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.textContent;
        submitBtn.textContent = "Logging in...";

    } else {

        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.originalText || "Login";

    }

}


async function loginEmployee() {

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

        /* Authorization check - being logged in is not enough,
           the role itself must be Admin or Employee */

        const { data: profile, error: profileError } = await db

            .from("profiles")

            .select("role")

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

        if (profile.role !== "Admin" && profile.role !== "Employee") {

            await db.auth.signOut();

            showMessage(

                "This login is for staff only.",

                "error"

            );

            return;

        }

        showMessage("Login successful! Redirecting...", "success");

        setTimeout(() => {

            window.location.href = "employee_dashboard.html";

        }, 1000);

    } catch (err) {

        console.error(err);
        showMessage("Unexpected error. Please try again later.", "error");

    } finally {

        setSubmitLoading(false);

    }

}


loginForm.addEventListener("submit", function (event) {

    event.preventDefault();

    if (!validateForm()) {
        return;
    }

    loginEmployee();

});
