const { Pool } = require("pg");

const ETH_MAINNET_CHAIN_ID = "0x1";
const MAX_FIELD_LENGTH = 1000;

let pool;
let tableReady;

function getPool() {
  if (!process.env.DATABASE) {
    throw new Error("DATABASE environment variable is not configured.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }

  return pool;
}

async function ensureTable() {
  if (!tableReady) {
    tableReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS humanoid_whitelist (
        id BIGSERIAL PRIMARY KEY,
        wallet TEXT NOT NULL,
        wallet_normalized TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        x_handle TEXT NOT NULL,
        signal TEXT NOT NULL,
        chain_id TEXT NOT NULL DEFAULT '0x1',
        user_agent TEXT,
        ip_address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS humanoid_whitelist_created_at_idx
        ON humanoid_whitelist (created_at DESC);
    `);
  }

  return tableReady;
}

function readBody(req) {
  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }

  return req.body || {};
}

function clean(value) {
  return String(value || "").trim();
}

function isValidWallet(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function getIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }

  return req.socket?.remoteAddress || "";
}

function validate(body) {
  const wallet = clean(body.wallet);
  const email = clean(body.email).toLowerCase();
  const xHandle = clean(body.handle || body.x_handle);
  const signal = clean(body.signal);
  const chainId = clean(body.chainId || body.chain_id || ETH_MAINNET_CHAIN_ID);

  if (!isValidWallet(wallet)) {
    return { error: "Connect a valid ETH wallet before submitting." };
  }

  if (chainId !== ETH_MAINNET_CHAIN_ID) {
    return { error: "Whitelist submissions must use Ethereum mainnet." };
  }

  if (!isValidEmail(email)) {
    return { error: "Enter a valid email address." };
  }

  if (!xHandle || xHandle.length > 64) {
    return { error: "Enter a valid X handle." };
  }

  if (!signal || signal.length > MAX_FIELD_LENGTH) {
    return { error: "Add a short signal for this wallet." };
  }

  return {
    value: {
      wallet,
      walletNormalized: wallet.toLowerCase(),
      email,
      xHandle,
      signal,
      chainId,
    },
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = readBody(req);
    const validation = validate(body);

    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    await ensureTable();

    const entry = validation.value;
    const result = await getPool().query(
      `
        INSERT INTO humanoid_whitelist (
          wallet,
          wallet_normalized,
          email,
          x_handle,
          signal,
          chain_id,
          user_agent,
          ip_address
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (wallet_normalized)
        DO UPDATE SET
          wallet = EXCLUDED.wallet,
          email = EXCLUDED.email,
          x_handle = EXCLUDED.x_handle,
          signal = EXCLUDED.signal,
          chain_id = EXCLUDED.chain_id,
          user_agent = EXCLUDED.user_agent,
          ip_address = EXCLUDED.ip_address,
          updated_at = NOW()
        RETURNING id, wallet, email, x_handle, chain_id, created_at, updated_at;
      `,
      [
        entry.wallet,
        entry.walletNormalized,
        entry.email,
        entry.xHandle,
        entry.signal,
        entry.chainId,
        req.headers["user-agent"] || "",
        getIp(req),
      ],
    );

    return res.status(200).json({ ok: true, entry: result.rows[0] });
  } catch (error) {
    console.error("Whitelist submission failed", error);
    return res.status(500).json({ error: "Whitelist submission failed." });
  }
};
