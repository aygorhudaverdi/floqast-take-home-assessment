const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const config = require("../config");
const auth = require("./middleware/auth");

const app = express();
app.use(cors());

app.get("/health", (req, res) => res.json({ status: "ok", service: "gateway" }));

app.use(
  "/api/users",
  auth,
  createProxyMiddleware({
    target: config.userServiceUrl,
    changeOrigin: true,
    pathRewrite: { "^/api/users": "/users" },
  })
);

app.use(
  "/api/transactions",
  auth,
  createProxyMiddleware({
    target: config.transactionServiceUrl,
    changeOrigin: true,
    pathRewrite: { "^/api/transactions": "/transactions" },
  })
);

app.use(
  "/api/notifications",
  auth,
  createProxyMiddleware({
    target: config.notificationServiceUrl,
    changeOrigin: true,
    pathRewrite: { "^/api/notifications": "/notifications" },
  })
);

app.use((req, res) => {
  res.status(404).json({ error: "NotFound", message: "no such gateway route" });
});

app.listen(config.gatewayPort, () => {
  console.log(`[gateway] listening on ${config.gatewayPort}`);
});
