const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  apiKey: required("API_KEY", "dev-secret-key"),
  gatewayPort: Number(process.env.GATEWAY_PORT || 4000),
  userServicePort: Number(process.env.USER_SERVICE_PORT || 4001),
  transactionServicePort: Number(process.env.TRANSACTION_SERVICE_PORT || 4002),
  notificationServicePort: Number(process.env.NOTIFICATION_SERVICE_PORT || 4003),
  frontendPort: Number(process.env.FRONTEND_PORT || 3000),
  userServiceUrl: process.env.USER_SERVICE_URL || "http://localhost:4001",
  transactionServiceUrl: process.env.TRANSACTION_SERVICE_URL || "http://localhost:4002",
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL || "http://localhost:4003",
};
