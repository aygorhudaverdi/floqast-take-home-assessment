const express = require("express");
const config = require("../config");
const store = require("./store");

const BASIC_ACCOUNT_LIMIT = 5000;

const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok", service: "transaction-service" }));

async function fetchUser(userId) {
  const response = await fetch(`${config.userServiceUrl}/users/${userId}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`user-service returned ${response.status}`);
  return response.json();
}

async function notify(userId, transaction) {
  try {
    await fetch(`${config.notificationServiceUrl}/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        transactionId: transaction.id,
        message: `${transaction.type} of $${transaction.amount} ${
          transaction.type === "transfer" ? `to ${transaction.recipientId} ` : ""
        }completed`,
      }),
    });
  } catch (err) {
    // Notification is best-effort; a delivery failure shouldn't fail the transaction.
    console.warn(`[transaction-service] notification delivery failed: ${err.message}`);
  }
}

app.post("/transactions", async (req, res) => {
  const { userId, amount, type, recipientId } = req.body || {};

  if (typeof userId !== "string" || userId.trim().length === 0) {
    return res.status(400).json({ error: "ValidationError", message: "userId is required" });
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "ValidationError", message: "amount must be a positive number" });
  }
  if (!store.VALID_TYPES.includes(type)) {
    return res.status(400).json({
      error: "ValidationError",
      message: `type must be one of: ${store.VALID_TYPES.join(", ")}`,
    });
  }
  if (type === "transfer" && (typeof recipientId !== "string" || recipientId.trim().length === 0)) {
    return res.status(400).json({ error: "ValidationError", message: "recipientId is required for transfers" });
  }

  let user;
  try {
    user = await fetchUser(userId);
  } catch (err) {
    return res.status(502).json({ error: "UpstreamError", message: "unable to reach user-service" });
  }
  if (!user) {
    return res.status(404).json({ error: "NotFound", message: "user not found" });
  }

  if (user.accountType === "basic" && amount > BASIC_ACCOUNT_LIMIT) {
    return res.status(403).json({
      error: "Forbidden",
      message: `basic accounts are limited to $${BASIC_ACCOUNT_LIMIT} per transaction; upgrade to premium for higher limits`,
    });
  }

  const transaction = store.create({ userId, amount, type, recipientId });
  notify(userId, transaction);
  return res.status(201).json(transaction);
});

app.get("/transactions/:userId", async (req, res) => {
  const { userId } = req.params;

  let user;
  try {
    user = await fetchUser(userId);
  } catch (err) {
    return res.status(502).json({ error: "UpstreamError", message: "unable to reach user-service" });
  }
  if (!user) {
    return res.status(404).json({ error: "NotFound", message: "user not found" });
  }

  return res.json(store.listByUserId(userId));
});

app.listen(config.transactionServicePort, () => {
  console.log(`[transaction-service] listening on ${config.transactionServicePort}`);
});
