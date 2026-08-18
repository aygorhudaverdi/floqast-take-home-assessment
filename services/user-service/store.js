const { randomUUID } = require("crypto");

// In-memory stand-in for the User Service's MongoDB collection.
const usersById = new Map();

const VALID_ACCOUNT_TYPES = ["basic", "premium"];

function findByEmail(email) {
  return [...usersById.values()].find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );
}

function getById(id) {
  return usersById.get(id);
}

function create({ name, email, accountType }) {
  const user = {
    id: randomUUID(),
    name,
    email,
    accountType,
    createdAt: new Date().toISOString(),
  };
  usersById.set(user.id, user);
  return user;
}

function reset() {
  usersById.clear();
}

module.exports = { findByEmail, getById, create, reset, VALID_ACCOUNT_TYPES };
