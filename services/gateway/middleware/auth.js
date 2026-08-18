const config = require("../../config");

function auth(req, res, next) {
  const key = req.header("x-api-key");
  if (!key || key !== config.apiKey) {
    return res.status(401).json({ error: "Unauthorized", message: "missing or invalid x-api-key header" });
  }
  return next();
}

module.exports = auth;
