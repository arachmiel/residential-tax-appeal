import { readFileSync } from "node:fs";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
pool
  .query(sql)
  .then(() => console.log("Schema is up to date."))
  .finally(() => pool.end());
