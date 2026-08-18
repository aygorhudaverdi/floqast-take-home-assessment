// Dev-only convenience: matches API_KEY in .env.example. Real auth flows would
// never ship a key to the client like this.
const API_BASE = "http://localhost:4000/api";
const API_KEY = "dev-secret-key";

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || `Request failed with status ${response.status}`);
  }
  return body;
}

function showMessage(el, text, kind) {
  el.textContent = text;
  el.className = `message ${kind}`;
}

const registerForm = document.getElementById("register-form");
if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const messageEl = document.getElementById("register-message");
    const resultEl = document.getElementById("register-result");
    resultEl.textContent = "";

    const formData = new FormData(registerForm);
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      accountType: formData.get("accountType"),
    };

    try {
      const user = await apiFetch("/users", { method: "POST", body: JSON.stringify(payload) });
      showMessage(messageEl, "User created successfully.", "success");
      resultEl.setAttribute("data-testid", "register-result");
      resultEl.textContent = `ID: ${user.id}`;
      registerForm.reset();
    } catch (err) {
      showMessage(messageEl, err.message, "error");
    }
  });
}

const transactionForm = document.getElementById("transaction-form");
if (transactionForm) {
  transactionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const messageEl = document.getElementById("transaction-message");

    const formData = new FormData(transactionForm);
    const payload = {
      userId: formData.get("userId"),
      amount: Number(formData.get("amount")),
      type: formData.get("type"),
      recipientId: formData.get("recipientId") || undefined,
    };

    try {
      const transaction = await apiFetch("/transactions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showMessage(messageEl, `Transaction ${transaction.id} completed.`, "success");
      transactionForm.reset();
    } catch (err) {
      showMessage(messageEl, err.message, "error");
    }
  });
}

const lookupButton = document.getElementById("lookup-button");
if (lookupButton) {
  lookupButton.addEventListener("click", async () => {
    const messageEl = document.getElementById("lookup-message");
    const table = document.getElementById("transactions-table");
    const tbody = document.getElementById("transactions-body");
    const userId = document.getElementById("lookupUserId").value.trim();

    messageEl.className = "message";
    table.style.display = "none";
    tbody.innerHTML = "";

    if (!userId) {
      showMessage(messageEl, "Enter a user ID first.", "error");
      return;
    }

    try {
      const transactions = await apiFetch(`/transactions/${userId}`);
      if (transactions.length === 0) {
        showMessage(messageEl, "No transactions for this user yet.", "success");
        return;
      }
      table.style.display = "table";
      for (const tx of transactions) {
        const row = document.createElement("tr");
        row.setAttribute("data-testid", "transaction-row");
        row.innerHTML = `
          <td>${tx.type}</td>
          <td>$${tx.amount.toFixed(2)}</td>
          <td>${tx.recipientId || "-"}</td>
          <td>${tx.status}</td>
          <td>${new Date(tx.createdAt).toLocaleString()}</td>
        `;
        tbody.appendChild(row);
      }
    } catch (err) {
      showMessage(messageEl, err.message, "error");
    }
  });
}
