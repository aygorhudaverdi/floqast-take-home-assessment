import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
export const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:4000";
export const API_KEY = process.env.TEST_API_KEY || "dev-secret-key";
