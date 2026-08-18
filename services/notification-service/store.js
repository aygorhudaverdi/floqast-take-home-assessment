const { randomUUID } = require("crypto");

// In-memory stand-in for Redis: a per-user list acting as the notification log.
const notificationsByUserId = new Map();

function create({ userId, message, transactionId }) {
  const notification = {
    id: randomUUID(),
    userId,
    transactionId: transactionId || null,
    message,
    createdAt: new Date().toISOString(),
  };
  const existing = notificationsByUserId.get(userId) || [];
  existing.push(notification);
  notificationsByUserId.set(userId, existing);
  return notification;
}

function listByUserId(userId) {
  return notificationsByUserId.get(userId) || [];
}

function reset() {
  notificationsByUserId.clear();
}

module.exports = { create, listByUserId, reset };
