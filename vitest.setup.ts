import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local for local development
config({ path: resolve(__dirname, ".env.local") });
