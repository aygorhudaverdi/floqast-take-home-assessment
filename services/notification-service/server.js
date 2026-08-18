const express = require("express");
const config = require("../config");
const store = require("./store");

const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok", service: "notification-service" }));

app.post("/notifications", (req, res) => {
  const { userId, message, transactionId } = req.body || {};

  if (typeof userId !== "string" || userId.trim().length === 0) {
    return res.status(400).json({ error: "ValidationError", message: "userId is required" });
  }
  if (typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "ValidationError", message: "message is required" });
  }

  const notification = store.create({ userId, message, transactionId });
  return res.status(201).json(notification);
});

app.get("/notifications/:userId", (req, res) => {
  return res.json(store.listByUserId(req.params.userId));
});

app.listen(config.notificationServicePort, () => {
  console.log(`[notification-service] listening on ${config.notificationServicePort}`);
});
