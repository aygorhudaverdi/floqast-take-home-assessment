const express = require("express");
const config = require("../config");
const store = require("./store");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok", service: "user-service" }));

app.post("/users", (req, res) => {
  const { name, email, accountType } = req.body || {};

  if (typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "ValidationError", message: "name is required" });
  }
  if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: "ValidationError", message: "a valid email is required" });
  }
  if (!store.VALID_ACCOUNT_TYPES.includes(accountType)) {
    return res.status(400).json({
      error: "ValidationError",
      message: `accountType must be one of: ${store.VALID_ACCOUNT_TYPES.join(", ")}`,
    });
  }
  if (store.findByEmail(email)) {
    return res.status(409).json({ error: "Conflict", message: "email already registered" });
  }

  const user = store.create({ name: name.trim(), email, accountType });
  return res.status(201).json(user);
});

app.get("/users/:id", (req, res) => {
  const user = store.getById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "NotFound", message: "user not found" });
  }
  return res.json(user);
});

app.listen(config.userServicePort, () => {
  console.log(`[user-service] listening on ${config.userServicePort}`);
});
