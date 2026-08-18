const { randomUUID } = require("crypto");

// In-memory stand-in for the Transaction Service's MongoDB collection.
const transactionsByUserId = new Map();

const VALID_TYPES = ["transfer", "deposit", "withdrawal"];

function listByUserId(userId) {
  return transactionsByUserId.get(userId) || [];
}

function create({ userId, amount, type, recipientId }) {
  const transaction = {
    id: randomUUID(),
    userId,
    amount,
    type,
    recipientId: recipientId || null,
    status: "completed",
    createdAt: new Date().toISOString(),
  };
  const existing = transactionsByUserId.get(userId) || [];
  existing.push(transaction);
  transactionsByUserId.set(userId, existing);
  return transaction;
}

function reset() {
  transactionsByUserId.clear();
}

module.exports = { listByUserId, create, reset, VALID_TYPES };
