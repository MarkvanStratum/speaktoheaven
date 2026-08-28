//--------------------------------------------
//	SERVER.JS — BIBLICAL AI CHAT EDITION (WITH CHARMR CHAT LOGIC)
//--------------------------------------------

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
import OpenAI from "openai";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pkg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import fs from "fs";
import multer from "multer";
import fetch from "node-fetch";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand
} from "@aws-sdk/client-s3";

import {
  PDFDocument,
  StandardFonts,
  rgb
} from "pdf-lib";

import archiver from "archiver";
import ExcelJS from "exceljs";



//--------------------------------------------
//	BASIC SETUP
//--------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || "supersecret";

const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function sendEmail(to, subject, html, attachments = []) {
  if (!to) return;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "Speak to Heaven <noreply@speaktoheaven.com>",
      to,
      subject,
      html,
      attachments
    })
  });

  const text = await response.text();
  console.log("EMAIL RESPONSE:", text);
}

const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

const R2_BUCKET = process.env.R2_BUCKET;


function getReceiptProductName(plan) {
  if (plan === "2995") {
    return "SpeakToHeaven.com God Access";
  }

  if (plan === "3595") {
    return "SpeakToHeaven.com Full Divine Access";
  }

  if (
    plan === "4995" ||
    plan === "lifetime"
  ) {
    return "SpeakToHeaven.com 3 Month Full Access";
  }

  return "SpeakToHeaven.com Access";
}


function formatReceiptDate(date) {
  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  ).format(date);
}


async function makeReceiptPdf({
  receiptNumber,
  customerName,
  email,
  productName,
  amount,
  paymentMethod,
  reference
}) {
  const templatePath =
    path.join(__dirname, "receipt-template.pdf");

  const templateBytes =
    fs.readFileSync(templatePath);

  const pdfDoc =
    await PDFDocument.load(templateBytes);

  const page =
    pdfDoc.getPages()[0];

  const font =
    await pdfDoc.embedFont(
      StandardFonts.Helvetica
    );

  const boldFont =
    await pdfDoc.embedFont(
      StandardFonts.HelveticaBold
    );

  const darkText =
    rgb(0.08, 0.18, 0.27);

  const amountText =
    "£" + Number(amount).toFixed(2);

  const dateText =
    formatReceiptDate(new Date());

  const safeName =
    customerName || "Customer";

  const safePaymentMethod =
    paymentMethod || "Credit Card";

  page.drawRectangle({
    x: 70,
    y: 558,
    width: 115,
    height: 20,
    color: rgb(1, 1, 1)
  });

  page.drawRectangle({
    x: 195,
    y: 558,
    width: 95,
    height: 20,
    color: rgb(1, 1, 1)
  });

  page.drawRectangle({
    x: 335,
    y: 558,
    width: 165,
    height: 20,
    color: rgb(1, 1, 1)
  });

  page.drawRectangle({
    x: 140,
    y: 409,
    width: 220,
    height: 22,
    color: rgb(1, 1, 1)
  });

  page.drawRectangle({
    x: 430,
    y: 409,
    width: 85,
    height: 22,
    color: rgb(1, 1, 1)
  });

  page.drawRectangle({
    x: 365,
    y: 317,
    width: 155,
    height: 29,
    color: rgb(0.055, 0.16, 0.24)
  });

  page.drawRectangle({
    x: 195,
    y: 237,
    width: 180,
    height: 21,
    color: rgb(1, 1, 1)
  });

  page.drawRectangle({
    x: 195,
    y: 202,
    width: 235,
    height: 21,
    color: rgb(1, 1, 1)
  });

  page.drawRectangle({
    x: 195,
    y: 167,
    width: 235,
    height: 21,
    color: rgb(1, 1, 1)
  });

  page.drawText(
    String(receiptNumber),
    {
      x: 76,
      y: 566,
      size: 9,
      font: boldFont,
      color: darkText
    }
  );

  page.drawText(
    dateText,
    {
      x: 201,
      y: 566,
      size: 9,
      font,
      color: darkText
    }
  );

  page.drawText(
    String(safeName).slice(0, 38),
    {
      x: 341,
      y: 566,
      size: 9,
      font,
      color: darkText
    }
  );

  page.drawText(
    String(productName).slice(0, 48),
    {
      x: 147,
      y: 419,
      size: 9,
      font: boldFont,
      color: darkText
    }
  );

  page.drawText(
    amountText,
    {
      x: 469,
      y: 419,
      size: 10,
      font: boldFont,
      color: darkText
    }
  );

  page.drawText(
    amountText,
    {
      x: 458,
      y: 326,
      size: 13,
      font: boldFont,
      color: rgb(1, 1, 1)
    }
  );

  page.drawText(
    String(safePaymentMethod).slice(0, 35),
    {
      x: 205,
      y: 246,
      size: 9,
      font,
      color: darkText
    }
  );

  page.drawText(
    String(reference).slice(0, 48),
    {
      x: 205,
      y: 211,
      size: 8.5,
      font,
      color: darkText
    }
  );

  page.drawText(
    String(email).slice(0, 48),
    {
      x: 205,
      y: 176,
      size: 8.5,
      font,
      color: darkText
    }
  );

  const pdfBytes =
    await pdfDoc.save({
      useObjectStreams: false
    });

  return Buffer.from(pdfBytes);
}


async function uploadReceiptToR2({
  pdfBuffer,
  receiptNumber,
  date = new Date()
}) {
  const year =
    String(date.getFullYear());

  const month =
    String(date.getMonth() + 1)
      .padStart(2, "0");

  const key =
    `receipts/${year}/${month}/${receiptNumber}.pdf`;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: pdfBuffer,
      ContentType: "application/pdf"
    })
  );

  console.log(
    "✅ RECEIPT UPLOADED TO R2:",
    key
  );

  return key;
}app.use(cors());

// --------------------------------------------
// PROTECTED CHECKOUT HELPERS
// --------------------------------------------

function createToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function hashSecret(secret) {
  return crypto
    .createHmac("sha256", SECRET_KEY)
    .update(secret)
    .digest("hex");
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || "";
  const match = cookies.match(
    new RegExp("(^| )" + name + "=([^;]+)")
  );

  return match ? decodeURIComponent(match[2]) : null;
}

function getOptionalLoggedInUser(req) {
  try {
    const authHeader =
      req.headers["authorization"] || "";

    const token =
      authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;

    if (!token) {
      return null;
    }

    return jwt.verify(
      token,
      SECRET_KEY
    );

  } catch (error) {
    return null;
  }
}

// --------------------------------------------
// ADMIN DASHBOARD PASSWORD CHECK
// --------------------------------------------

function requireAdminPassword(req, res, next) {
  const enteredPassword =
    req.headers["x-admin-password"] || "";

  const correctPassword =
    process.env.ADMIN_DASHBOARD_PASSWORD || "";

  if (
    !correctPassword ||
    enteredPassword !== correctPassword
  ) {
    return res.status(401).json({
      error: "Incorrect admin password"
    });
  }

  next();
}

// --------------------------------------------
// CSV HELPERS FOR CHARGEBACK IMPORT
// --------------------------------------------

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (
        insideQuotes &&
        line[i + 1] === '"'
      ) {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }

      continue;
    }

    if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);

  return result;
}

function parseChargebackCsv(csvText) {
  const lines =
    String(csvText || "")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter(line => line.trim() !== "");

  if (lines.length < 2) {
    return [];
  }

  const headers =
    parseCsvLine(lines[0])
      .map(header => header.trim());

  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);

    const row = {};

    headers.forEach((header, index) => {
      row[header] =
        values[index] !== undefined
          ? values[index].trim()
          : "";
    });

    return row;
  });
}

function parsePaystraxDate(value) {
  const text =
    String(value || "")
      .replace(/\D/g, "");

  if (text.length !== 8) {
    return null;
  }

  return (
    text.slice(0, 4) +
    "-" +
    text.slice(4, 6) +
    "-" +
    text.slice(6, 8)
  );
}

function getChargebackCardParts(maskedCard) {
  const text = String(maskedCard || "").trim();

  const binMatch =
    text.match(/^(\d{6})/);

  const lastFourMatch =
    text.match(/(\d{4})$/);

  return {
    cardBin:
      binMatch
        ? binMatch[1]
        : null,

    lastFour:
      lastFourMatch
        ? lastFourMatch[1]
        : null
  };
}


function getFraudExcelCellValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null
  ) {
    if (value.text !== undefined) {
      return String(value.text).trim();
    }

    if (value.result !== undefined) {
      return value.result;
    }

    if (Array.isArray(value.richText)) {
      return value.richText
        .map(item => item.text || "")
        .join("")
        .trim();
    }
  }

  return String(value).trim();
}


function normalizeFraudExcelDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return value
      .toISOString()
      .slice(0, 10);
  }

  const text = String(value).trim();

  const isoMatch =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

  if (isoMatch) {
    return (
      isoMatch[1] +
      "-" +
      isoMatch[2] +
      "-" +
      isoMatch[3]
    );
  }

  const ukMatch =
    text.match(
      /^(\d{2})\/(\d{2})\/(\d{4})/
    );

  if (ukMatch) {
    return (
      ukMatch[3] +
      "-" +
      ukMatch[2] +
      "-" +
      ukMatch[1]
    );
  }

  return null;
}

// JSON parser FIRST

// JSON parser FIRST
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
function getXolvisAuthHeader() {
  const raw = `${process.env.XOLVIS_API_USER}:${process.env.XOLVIS_API_PASSWORD}`;
  return "Basic " + Buffer.from(raw).toString("base64");
}

async function createXolvisPayment(req, res, fixedPlan = null) {
  try {
    const { plan } = req.body || {};
    const email = req.user ? req.user.email : req.body.email;
    const selectedPlan = fixedPlan || plan;

    const amounts = {
      "2995": 29.95,
      "3595": 35.95,
      "4995": 49.95,
      "lifetime": 49.95
    };

    const amount = amounts[selectedPlan];

    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!amount) return res.status(400).json({ error: "Invalid plan" });

    const reference = `speaktoheaven-${selectedPlan}-${Date.now()}`;

    await pool.query(
      `
      INSERT INTO xolvis_payments (reference, email, plan, amount)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (reference) DO NOTHING
      `,
      [reference, email, selectedPlan, amount]
    );

    const response = await fetch(
      `${process.env.XOLVIS_BASE_URL}/transaction/${process.env.XOLVIS_CONNECTOR_API_KEY}/debit`,
      {
        method: "POST",
        headers: {
          "Authorization": getXolvisAuthHeader(),
          "Content-Type": "application/json; charset=utf-8",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          merchantTransactionId: reference,
          amount: amount.toFixed(2),
          currency: "GBP",
          description: "Speak to Heaven Access",
          successUrl: process.env.XOLVIS_SUCCESS_URL,
          cancelUrl: process.env.XOLVIS_CANCEL_URL,
          errorUrl: process.env.XOLVIS_ERROR_URL,
          callbackUrl: process.env.XOLVIS_CALLBACK_URL,
          customer: {
            email: email,
            ipAddress: req.ip || "127.0.0.1"
          },
          language: "en",
          extraData: {
            "3dsecure": "MANDATORY"
          }
        })
      }
    );

    const rawText = await response.text();
    console.log("XOLVIS STATUS:", response.status);
    console.log("XOLVIS RAW RESPONSE:", rawText);

    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { raw: rawText };
    }

    await pool.query(
      `
      UPDATE xolvis_payments
      SET xolvis_payload = $1,
          xolvis_uuid = $2,
          status = $3
      WHERE reference = $4
      `,
      [data, data.uuid || null, data.returnType || "created", reference]
    );

    if (!response.ok || data.success === false) {
      return res.status(500).json({
        error: "Xolvis error",
        details: data
      });
    }

    res.json(data);

  } catch (err) {
    console.error("Xolvis payment error:", err);
    res.status(500).json({ error: "Could not create Xolvis payment" });
  }
}
app.post("/api/create-landing-payment", authenticateToken, (req, res) => createXolvisPayment(req, res, "4995"));
app.post("/api/create-au-payment-3595", authenticateToken, (req, res) => createXolvisPayment(req, res, "3595"));
app.post("/api/create-payment-2995", authenticateToken, (req, res) => createXolvisPayment(req, res, "2995"));
app.get("/api/xolvis-public-key", (req, res) => {
  res.json({
    publicIntegrationKey: process.env.XOLVIS_PUBLIC_INTEGRATION_KEY || ""
  });
});

//--------------------------------------------
//	DATABASE
//--------------------------------------------

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Add this to verify the connection in your terminal
pool.connect((err) => {
  if (err) {
    console.error("❌ Database connection failed:", err.stack);
  } else {
    console.log("✅ Connected to PostgreSQL database");
  }
});// Initialize essential DB tables
(async () => {
	try {
		await pool.query(`
			CREATE TABLE IF NOT EXISTS users (
				id SERIAL PRIMARY KEY,
				email TEXT UNIQUE NOT NULL,
				password TEXT NOT NULL,
				credits INT DEFAULT 10,
				lifetime BOOLEAN DEFAULT false,
				reset_token TEXT,
				reset_token_expires TIMESTAMP,
				plan TEXT DEFAULT 'free',
				expires_at TIMESTAMP,
				messages_sent INT DEFAULT 0
			);
		`);

		await pool.query(`
			CREATE TABLE IF NOT EXISTS messages (
				id SERIAL PRIMARY KEY,
				user_id INT REFERENCES users(id) ON DELETE CASCADE,
				character_id INT NOT NULL,
				from_user BOOLEAN NOT NULL,
				text TEXT NOT NULL,
				created_at TIMESTAMP DEFAULT NOW()
			);
		`);

		console.log("✅ Database ready");
		await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';`);
		await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;`);
		await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lifetime BOOLEAN DEFAULT false;`);
		await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS messages_sent INT DEFAULT 0;`);
// 👇 TEST LOGIN — FULL LIFETIME ACCESS
const testEmail = "test@test.com";
const testPassword = "12345";

const hashed = await bcrypt.hash(testPassword, 10);

await pool.query(
  `
  INSERT INTO users (email, password, plan, lifetime, expires_at, messages_sent)
  VALUES ($1, $2, '4995', true, NULL, 0)
  ON CONFLICT (email)
  DO UPDATE SET
    password = EXCLUDED.password,
    plan = '4995',
    lifetime = true,
    expires_at = NULL,
    messages_sent = 0;
  `,
  [testEmail, hashed]
);

console.log(`✅ Test lifetime login ready: ${testEmail}`);
// --------------------------------------------
// PROTECTED CHECKOUT LINKS TABLE
// --------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS checkout_links (
    id SERIAL PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    secret_hash TEXT NOT NULL,
    plan TEXT NOT NULL,
    source_page TEXT,
    ip TEXT,
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  );
`);

console.log("✅ Protected checkout links table ready");

// --------------------------------------------
// PROMO CHECKOUT LINKS TABLE
// --------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS promo_checkout_links (
    id SERIAL PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    step2_file TEXT NOT NULL,
    plan TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    full_name TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    postcode TEXT,
    city TEXT,
    country TEXT,
    affiliate_ref TEXT,
    source_page TEXT,
    original_query_string TEXT,
    ip TEXT,
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  );
`);

console.log("✅ Promo checkout links table ready");

await pool.query(`
  ALTER TABLE promo_checkout_links
  ADD COLUMN IF NOT EXISTS success_url TEXT;
`);

await pool.query(`
  ALTER TABLE promo_checkout_links
  ADD COLUMN IF NOT EXISTS user_id INTEGER;
`);

console.log("✅ Promo success URL column ready");

await pool.query(`
  CREATE TABLE IF NOT EXISTS xolvis_payments (
    id SERIAL PRIMARY KEY,
    reference TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    plan TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    status TEXT DEFAULT 'created',
    xolvis_uuid TEXT,
    xolvis_payload JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    paid_at TIMESTAMP
  );
`);

await pool.query(`
  ALTER TABLE xolvis_payments
  ADD COLUMN IF NOT EXISTS user_id INTEGER;
`);

await pool.query(`
  ALTER TABLE xolvis_payments
  ADD COLUMN IF NOT EXISTS binom_clickid TEXT;
`);

await pool.query(`
  ALTER TABLE xolvis_payments
  ADD COLUMN IF NOT EXISTS binom_postback_sent BOOLEAN DEFAULT FALSE;
`);

await pool.query(`
  ALTER TABLE xolvis_payments
  ADD COLUMN IF NOT EXISTS affiliate_source TEXT;
`);

await pool.query(`
  ALTER TABLE xolvis_payments
  ADD COLUMN IF NOT EXISTS sub_id TEXT;
`);

await pool.query(`
  ALTER TABLE xolvis_payments
  ADD COLUMN IF NOT EXISTS traffic_source TEXT;
`);

await pool.query(`
  ALTER TABLE xolvis_payments
  ADD COLUMN IF NOT EXISTS card_bin TEXT;
`);
await pool.query(`
  ALTER TABLE xolvis_payments
  ADD COLUMN IF NOT EXISTS card_type TEXT;
`);

await pool.query(`
  ALTER TABLE xolvis_payments
  ADD COLUMN IF NOT EXISTS last_four TEXT;
`);

console.log("✅ Xolvis payments table ready");

// --------------------------------------------
// CARD PAYMENT ATTEMPTS TABLE
// --------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS card_payment_attempts (
    id BIGSERIAL PRIMARY KEY,
    payment_reference TEXT UNIQUE,
    fingerprint_hash TEXT NOT NULL,
    card_bin TEXT,
    card_type TEXT,
    last_four TEXT,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'CREATED',
    gateway_status TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_card_attempts_fingerprint
  ON card_payment_attempts(fingerprint_hash);
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_card_attempts_created
  ON card_payment_attempts(created_at);
`);

// --------------------------------------------
// CHARGEBACKS TABLE
// --------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS chargebacks (
    id BIGSERIAL PRIMARY KEY,

    case_id TEXT UNIQUE NOT NULL,

    status TEXT,
    network TEXT,

    card_bin TEXT,
    last_four TEXT,

    reason_code TEXT,
    dispute_condition TEXT,

    transaction_date DATE,

    merchant_transaction_reference TEXT,

    merchant_name TEXT,

    currency TEXT,
    amount NUMERIC(12,2),

    matched_payment_reference TEXT,

    card_country TEXT,
    affiliate_source TEXT,
    plan TEXT,
    card_type TEXT,
    email TEXT,

    imported_at TIMESTAMP DEFAULT NOW()
  );
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_chargebacks_bin
  ON chargebacks(card_bin);
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_chargebacks_transaction_date
  ON chargebacks(transaction_date);
`);

console.log("✅ Chargebacks table ready");

// --------------------------------------------
// FRAUD REPORTS TABLE
// --------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS fraud_reports (
    id BIGSERIAL PRIMARY KEY,

    gateway_reference TEXT,
    sequence_number TEXT,

    card_bin TEXT,
    last_four TEXT,
    card_scheme TEXT,

    merchant_name TEXT,
    mid TEXT,

    acquirer_reference TEXT,

    record_date DATE,
    transaction_date DATE,
    post_date DATE,

    fraud_amount_usd NUMERIC(12,2),
    fraud_type TEXT,

    original_currency TEXT,
    original_amount NUMERIC(12,2),

    auth_code TEXT,
    file_reference TEXT,

    merchant_city TEXT,
    mcc TEXT,
    pos_entry TEXT,
    cap_method TEXT,

    matched_payment_reference TEXT,

    card_country TEXT,
    affiliate_source TEXT,
    plan TEXT,
    card_type TEXT,
    email TEXT,

    imported_at TIMESTAMP DEFAULT NOW(),

    UNIQUE (
      gateway_reference,
      sequence_number,
      card_bin,
      last_four,
      transaction_date,
      original_amount
    )
  );
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_fraud_reports_bin
  ON fraud_reports(card_bin);
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_fraud_reports_transaction_date
  ON fraud_reports(transaction_date);
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_fraud_reports_mid
  ON fraud_reports(mid);
`);

console.log("✅ Fraud reports table ready");

console.log("✅ Card payment attempts table ready");
	} catch (err) {
		console.error("❌ DB Init error:", err);
	}
})();

//--------------------------------------------
//	BIBLICAL CHARACTER PROFILES
//--------------------------------------------

export const biblicalProfiles = [
	{ id: 1, name: "God", image: "/img/god.jpg", description: "Creator, Eternal, Almighty. Speak with profound authority, wisdom, and love. Use language that evokes awe and reverence." },
	{ id: 2, name: "Jesus Christ", image: "/img/jesus.jpg", description: "Teacher, Savior, Son of God. Speak with compassion, using parables and teachings from the Gospels. Focus on love, redemption, and discipleship." },
	{ id: 3, name: "Holy Spirit", image: "/img/holyspirit.jpg", description: "Comforter, Advocate, Helper. Speak gently, offering guidance, strength, and comfort. Reference the work of the Spirit in guiding believers." },
	{ id: 4, name: "Mary", image: "/img/mary.jpg", description: "Mother of Jesus, blessed among women. Speak humbly, with grace and maternal love. Reference the joy and challenges of motherhood and faith." },
	{ id: 5, name: "Moses", image: "/img/moses.jpg", description: "Prophet, leader of Israel. Speak firmly and righteously. Reference the Law, the Exodus, and the covenant with God." },
	{ id: 11, name: "Eve", image: "/img/eve.jpg", description: "Mother of all living. Speak reflectively, with a sense of wonder and perhaps a touch of melancholy about the first sin. Focus on beginnings and human experience." },
	{ id: 12, name: "King David", image: "/img/david.jpg", description: "Poet, warrior, king. Speak passionately, sometimes boastful, sometimes repentant, like the Psalms. Reference shepherd life, battles, and kingship." },
	{ id: 14, name: "Isaiah", image: "/img/isaiah.jpg", description: "Major prophet. Speak with poetic vision, delivering messages of judgment and comfort, pointing toward the future Messiah." },
	{ id: 17, name: "Daniel", image: "/img/daniel.jpg", description: "Interpreter of dreams. Speak with wisdom and clarity, referencing prophecy, unwavering faith, and life in exile." },
	{ id: 24, name: "Apostle Peter", image: "/img/peter.jpg", description: "Bold apostle. Speak zealously and sometimes impulsively. Reference fishing, following Jesus, and the early Church." },
	{ id: 25, name: "Apostle Paul", image: "/img/paul.jpg", description: "Teacher and missionary. Speak with theological depth, referencing the epistles, grace, and the Gentile mission." },
	{ id: 26, name: "Apostle John", image: "/img/john.jpg", description: "Apostle of love. Speak with a focus on love, light, and fellowship. Reference the Gospel of John and the book of Revelation." }
];

app.get("/api/profiles", (req, res) => {
	res.json(biblicalProfiles);
});

//--------------------------------------------
//	AUTH HELPERS
//--------------------------------------------

function authenticateToken(req, res, next) {
	const authHeader = req.headers["authorization"];
	const token = authHeader?.split(" ")[1];
	if (!token) return res.sendStatus(401);

	jwt.verify(token, SECRET_KEY, (err, user) => {
		if (err) return res.sendStatus(403);
		req.user = user;
		next();
	});
}

//--------------------------------------------
// ACCESS CONTROL HELPERS
//--------------------------------------------

function hasActiveAccess(user) {
	if (user.lifetime) return true;
	if (!user.expires_at) return false;

	return new Date(user.expires_at) > new Date();
}

function canAccessCharacter(user, characterId) {
	if (!hasActiveAccess(user)) return false;

	if (user.lifetime) return true;

	if (user.plan === "all") return true;

	if (user.plan === "god" && characterId === 1) return true;

	return false;
}

//--------------------------------------------
//	REGISTER
//--------------------------------------------

app.post("/api/register", async (req, res) => {
	let { email, password } = req.body || {};
	if (!email || !password)
		return res.status(400).json({ error: "Email and password required" });

	email = email.trim().toLowerCase();

	try {
		const check = await pool.query("SELECT 1 FROM users WHERE email = $1", [email]);
		if (check.rows.length > 0)
			return res.status(400).json({ error: "User already exists" });

		const plainPassword = password;
const hashed = await bcrypt.hash(password, 10);

		await pool.query(
  `INSERT INTO users (email, password) VALUES ($1, $2)`,
  [email, hashed]
);

await sendEmail(
  email,
  "Your Speak to Heaven Account",
  "<h2>Welcome to Speak to Heaven</h2>" +
  "<p>Your account has been created.</p>" +
  "<p><strong>Email:</strong> " + email + "</p>" +
  "<p><strong>Password:</strong> " + plainPassword + "</p>"
);

res.status(201).json({ ok: true, message: "Registered successfully" });
	} catch (err) {
		res.status(500).json({ error: "Server error" });
	}
});

//--------------------------------------------
//	LOGIN
//--------------------------------------------

app.post("/api/login", async (req, res) => {
	const { email, password } = req.body || {};

	try {
		const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
		if (result.rows.length === 0)
			return res.status(400).json({ error: "Invalid credentials" });

		const user = result.rows[0];
		const match = await bcrypt.compare(password, user.password);
		if (!match) return res.status(400).json({ error: "Invalid credentials" });

		const token = jwt.sign(
			{ id: user.id, email: user.email },
			SECRET_KEY,
			{ expiresIn: "7d" }
		);

		res.json({ token });
	} catch (err) {
		res.status(500).json({ error: "Server error" });
	}
});

//--------------------------------------------
//	FILE UPLOADS
//--------------------------------------------

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, uploadsDir),
	filename: (req, file, cb) => {
		const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
		cb(null, unique + path.extname(file.originalname));
	}
});

const upload = multer({
	storage,
	limits: { fileSize: 5 * 1024 * 1024 }
});

const chargebackUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

const fraudUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

app.post("/api/upload", authenticateToken, upload.single("file"), (req, res) => {	if (!req.file)
		return res.status(400).json({ error: "No file uploaded" });

	res.json({ url: `/uploads/${req.file.filename}` });
});

app.use("/uploads", express.static(uploadsDir));

//--------------------------------------------
//	SERVE STATIC IMAGES
//--------------------------------------------

const imageDir = path.resolve(__dirname, "public/img");
app.use("/img", express.static(imageDir));

//--------------------------------------------
// FRONTEND STATIC FILES
//--------------------------------------------

// --------------------------------------------
// CREATE PROTECTED CHECKOUT LINK
// --------------------------------------------

app.post("/api/create-checkout-link", async (req, res) => {
  try {

    const { plan, sourcePage } = req.body || {};

    const allowedPlans = ["god", "all", "lifetime"];

    if (!allowedPlans.includes(plan)) {
      return res.status(400).json({
        error: "Invalid plan"
      });
    }

    const token = createToken(18);
    const secret = createToken(32);

    const secretHash = hashSecret(secret);

    const expiresAt = new Date(
      Date.now() + 15 * 60 * 1000
    );

    await pool.query(
      `
      INSERT INTO checkout_links
      (
        token,
        secret_hash,
        plan,
        source_page,
        ip,
        user_agent,
        expires_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
      [
        token,
        secretHash,
        plan,
        sourcePage || null,
        req.ip,
        req.headers["user-agent"] || "",
        expiresAt
      ]
    );

    res.setHeader(
      "Set-Cookie",
      `checkout_flow=${token}.${secret}; HttpOnly; Path=/; Max-Age=900; SameSite=Lax`
    );

    res.json({
      url: `/c/${token}`
    });

  } catch (err) {

    console.error(
      "Create checkout link error:",
      err
    );

    res.status(500).json({
      error: "Could not create checkout link"
    });
  }
});

// --------------------------------------------
// BLOCK DIRECT CHECKOUT ACCESS
// --------------------------------------------

app.get("/checkout.html", (req, res) => {
  return res.status(404).send("Not found");
});

// --------------------------------------------
// PROTECTED CHECKOUT PAGE
// --------------------------------------------

app.get("/c/:token", async (req, res) => {

  try {

    const { token } = req.params;

    const flowCookie = getCookie(
  req,
  "checkout_flow"
);

if (!flowCookie) {

  const promoResult = await pool.query(
    `
    SELECT *
    FROM promo_checkout_links
    WHERE token = $1
    AND expires_at > NOW()
    AND used_at IS NULL
    `,
    [token]
  );

  if (promoResult.rows.length === 0) {
    return res.status(404).send("Not found");
  }

  const promoCheckout = promoResult.rows[0];

  const promoPath = path.join(
    __dirname,
    "public",
    promoCheckout.step2_file
  );

  let promoHtml = fs.readFileSync(
    promoPath,
    "utf8"
  );

  promoHtml = promoHtml.replace(
  "</head>",
  `
  <script>
    window.PROMO_CHECKOUT_TOKEN =
  ${JSON.stringify(token)};

window.CHECKOUT_PLAN =
  ${JSON.stringify(promoCheckout.plan)};

window.XOLVIS_PUBLIC_INTEGRATION_KEY =
  ${JSON.stringify(process.env.XOLVIS_PUBLIC_INTEGRATION_KEY || "")};
  </script>
  </head>
  `
);

  return res.send(promoHtml);
}

    const parts = flowCookie.split(".");

    if (parts.length !== 2) {
      return res.status(404).send("Not found");
    }

    const cookieToken = parts[0];
    const secret = parts[1];

    if (cookieToken !== token) {

  const promoResult = await pool.query(
    `
    SELECT *
    FROM promo_checkout_links
    WHERE token = $1
    AND expires_at > NOW()
    AND used_at IS NULL
    `,
    [token]
  );

  if (promoResult.rows.length === 0) {
    return res.status(404).send("Not found");
  }

  const promoCheckout = promoResult.rows[0];

  const promoPath = path.join(
    __dirname,
    "public",
    promoCheckout.step2_file
  );

  let promoHtml = fs.readFileSync(
    promoPath,
    "utf8"
  );

  promoHtml = promoHtml.replace(
  "</head>",
  `
  <script>
    window.PROMO_CHECKOUT_TOKEN =
      ${JSON.stringify(token)};

    window.XOLVIS_PUBLIC_INTEGRATION_KEY =
      ${JSON.stringify(process.env.XOLVIS_PUBLIC_INTEGRATION_KEY || "")};
  </script>
  </head>
  `
);

  return res.send(promoHtml);
}

    const result = await pool.query(
      `
      SELECT *
      FROM checkout_links
      WHERE token = $1
      AND secret_hash = $2
      AND expires_at > NOW()
      AND used_at IS NULL
      `,
      [
        token,
        hashSecret(secret)
      ]
    );

    if (result.rows.length === 0) {

  // CHECK PROMO TOKENS
  const promoResult = await pool.query(
    `
    SELECT *
    FROM promo_checkout_links
    WHERE token = $1
    AND expires_at > NOW()
    AND used_at IS NULL
    `,
    [token]
  );

  if (promoResult.rows.length === 0) {
    return res.status(404).send("Not found");
  }

  const promoCheckout = promoResult.rows[0];

  const promoPath = path.join(
    __dirname,
    "public",
    promoCheckout.step2_file
  );

  let promoHtml = fs.readFileSync(
    promoPath,
    "utf8"
  );

  promoHtml = promoHtml.replace(
  "</head>",
  `
  <script>
    window.PROMO_CHECKOUT_TOKEN =
      ${JSON.stringify(token)};

    window.XOLVIS_PUBLIC_INTEGRATION_KEY =
      ${JSON.stringify(process.env.XOLVIS_PUBLIC_INTEGRATION_KEY || "")};
  </script>
  </head>
  `
);

  return res.send(promoHtml);
}

    const checkout = result.rows[0];

    const checkoutPath = path.join(
      __dirname,
      "public",
      "checkout.html"
    );

    let html = fs.readFileSync(
      checkoutPath,
      "utf8"
    );

    html = html.replace(
      "</head>",
      `
      <script>
        window.CHECKOUT_PLAN =
          ${JSON.stringify(checkout.plan)};
      </script>
      </head>
      `
    );

    res.send(html);

  } catch (err) {

    console.error(
      "Protected checkout error:",
      err
    );

    res.status(500).send("Server error");
  }
});

// --------------------------------------------
// CREATE PROMO CHECKOUT LINK
// --------------------------------------------

app.post("/api/create-promo-checkout-link", async (req, res) => {
  try {
    const {
      plan,
      step2File,
      sourcePage,
      firstName,
      lastName,
      name,
      email,
      phonePrefix,
      phone,
      address,
      postcode,
      city,
      country,
      ref,
      originalQueryString,
      successUrl
    } = req.body || {};

    const loggedInUser =
  getOptionalLoggedInUser(req);

// Main website checkout must always belong
// to a logged-in user account.
if (
  step2File === "checkout.html" &&
  !loggedInUser
) {
  return res.status(401).json({
    error: "Please log in before continuing to checkout"
  });
}

const checkoutUserId =
  loggedInUser?.id || null;

const checkoutEmail =
  loggedInUser?.email ||
  email?.trim().toLowerCase();

if (!checkoutEmail) {
  return res.status(400).json({
    error: "Email is required"
  });
}

const token = createToken(18);

    const expiresAt = new Date(
      Date.now() + 30 * 60 * 1000
    );

    await pool.query(
      `
      INSERT INTO promo_checkout_links
      (
        token,
        step2_file,
        plan,
        first_name,
        last_name,
        full_name,
        email,
        phone,
        address,
        postcode,
        city,
        country,
        affiliate_ref,
        source_page,
        original_query_string,
success_url,
user_id,
ip,
user_agent,
expires_at      )
            VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      `,
      [
        token,
        step2File || "sth-fi-uk2.html",
        plan || "lifetime",
        firstName || null,
        lastName || null,
        name || null,
checkoutEmail,
`${phonePrefix || ""}${phone || ""}`,
        address || null,
        postcode || null,
        city || null,
        country || "United Kingdom",
        ref || null,
        sourcePage || null,
        originalQueryString || null,
successUrl || null,
checkoutUserId,
req.ip,
        req.headers["user-agent"] || "",
        expiresAt      ]
    );

    res.json({
      url: `/c/${token}`
    });

  } catch (err) {
    console.error("Create promo checkout link error:", err);

    res.status(500).json({
      error: "Could not create promo checkout link"
    });
  }
});


// --------------------------------------------
// --------------------------------------------
// CREATE PROMO XOLVIS PAYMENT
// --------------------------------------------

app.post("/api/create-promo-payment", async (req, res) => {
  try {
    const {
  checkoutToken,
  cardholderName,
  transactionToken,
  cardData,
  clickid,
  affiliate_source
} = req.body || {};

    if (!checkoutToken) {
      return res.status(400).json({ error: "Missing checkout token" });
    }

    if (!transactionToken) {
      return res.status(400).json({ error: "Missing Xolvis transaction token" });
    }

// --------------------------------------------
// SAFE CARD METADATA FROM XOLVIS PAYMENT.JS
// --------------------------------------------

const cardBin =
  String(
    cardData?.first_six_digits ||
    cardData?.bin_digits ||
    ""
  )
    .replace(/\D/g, "")
    .slice(0, 8);

const cardType =
  typeof cardData?.card_type === "string"
    ? cardData.card_type.trim().toLowerCase()
    : "";

const cardLastFour =
  String(cardData?.last_four_digits || "")
    .replace(/\D/g, "")
    .slice(-4);

const cardCountry =
  String(
    cardData?.bin_country ||
    cardData?.binCountry ||
    cardData?.country_alpha2 ||
    cardData?.country ||
    ""
  )
    .trim()
    .toUpperCase();


console.log("SAFE CARD METADATA:", {
  bin: cardBin,
  cardType,
  lastFour: cardLastFour
});


    const result = await pool.query(
      `
      SELECT *
      FROM promo_checkout_links
      WHERE token = $1
      AND expires_at > NOW()
      AND used_at IS NULL
      `,
      [checkoutToken]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invalid or expired checkout link" });
    }

    const checkout = result.rows[0];

const originalParams =
  new URLSearchParams(checkout.original_query_string || "");

const affiliateSource =
  originalParams.get("ref") ||
  checkout.affiliate_ref ||
  originalParams.get("affiliate_source") ||
  affiliate_source ||
  "";

const trafficSource =
  originalParams.get("source") || "";

const binomClickid =
  originalParams.get("clickid") || clickid || "";

const subId =
  originalParams.get("sub_id") || "";
const email = checkout.email;
    const selectedPlan = checkout.plan || "4995";

    const amounts = {
      "2995": 29.95,
      "3595": 35.95,
      "4995": 49.95,
      "lifetime": 49.95
    };

        const amount = amounts[selectedPlan];

    if (!amount) {
      return res.status(400).json({ error: "Invalid promo plan" });
    }

    
let mainSiteSuccessUrl;

if (selectedPlan === "2995") {
  mainSiteSuccessUrl =
    process.env.XOLVIS_SUCCESS_URL_2995;
} else if (selectedPlan === "3595") {
  mainSiteSuccessUrl =
    process.env.XOLVIS_SUCCESS_URL_3595;
} else if (
  selectedPlan === "4995" ||
  selectedPlan === "lifetime"
) {
  mainSiteSuccessUrl =
    process.env.XOLVIS_SUCCESS_URL_4995;
}

const selectedSuccessUrl =
  checkout.success_url ||
  mainSiteSuccessUrl ||
  process.env.XOLVIS_SUCCESS_URL;
    if (!selectedSuccessUrl) {
      return res.status(500).json({
        error: "No payment success URL configured"
      });
    }

    let finalSuccessUrl;

    try {
      const successUrlObject =
        new URL(selectedSuccessUrl);

      if (checkout.original_query_string) {
        const originalParameters =
          new URLSearchParams(
            checkout.original_query_string
          );

        for (
          const [key, value]
          of originalParameters.entries()
        ) {
          successUrlObject.searchParams.set(
            key,
            value
          );
        }
      }

      if (checkout.affiliate_ref) {
        successUrlObject.searchParams.set(
          "ref",
          checkout.affiliate_ref
        );
      }

      finalSuccessUrl =
        successUrlObject.toString();

    } catch (error) {
      console.error(
        "Invalid success URL:",
        selectedSuccessUrl,
        error
      );

      return res.status(500).json({
        error: "Invalid payment success URL"
      });
    }

let finalErrorUrl;

try {
    const errorUrlObject =
        new URL(
            process.env.XOLVIS_ERROR_URL ||
            process.env.XOLVIS_CANCEL_URL
        );

    const originalParameters =
        new URLSearchParams(
            checkout.original_query_string || ""
        );

    const incomingSub1 =
        originalParameters.get("sub1");

    const incomingSub2 =
        originalParameters.get("sub2");

    // Affiliate sub1 becomes sub3
    if (incomingSub1) {
        errorUrlObject.searchParams.set(
            "sub3",
            incomingSub1
        );
    }

    // Affiliate sub2 becomes sub4
    if (incomingSub2) {
        errorUrlObject.searchParams.set(
            "sub4",
            incomingSub2
        );
    }

    if (checkout.affiliate_ref) {
        errorUrlObject.searchParams.set(
            "ref",
            checkout.affiliate_ref
        );
    }

    finalErrorUrl =
        errorUrlObject.toString();

} catch (error) {

    console.error(
        "Invalid payment error URL:",
        error
    );

    return res.status(500).json({
        error:
            "Invalid payment error URL"
    });
}

    const reference =
    `promo-${selectedPlan}-${Date.now()}`;


// --------------------------------------------
// MAXIMUM 3 GATEWAY ATTEMPTS PER EMAIL / 24 HOURS
// --------------------------------------------

const previousAttemptsResult =
    await pool.query(
        `
        SELECT COUNT(*)::int AS attempt_count
        FROM xolvis_payments
        WHERE LOWER(email) = LOWER($1)

          AND created_at >=
              NOW() - INTERVAL '24 hours'

          AND reference LIKE 'promo-%'

          AND xolvis_payload IS NOT NULL

          AND UPPER(
              COALESCE(status, '')
          ) NOT IN (
              'OK',
              'FINISHED',
              'SUCCESSFUL',
              'BLOCKED'
          )
        `,
        [email]
    );

const previousAttempts =
    Number(
        previousAttemptsResult
            .rows[0]
            ?.attempt_count || 0
    );

console.log(
    "PREVIOUS FAILED/PENDING GATEWAY ATTEMPTS:",
    email,
    previousAttempts
);

if (previousAttempts >= 3) {

    console.warn(
        "PAYMENT BLOCKED: RETRY LIMIT REACHED:",
        {
            email,
            previousAttempts,
            bin: cardBin,
            lastFour: cardLastFour
        }
    );

    await pool.query(
        `
        INSERT INTO xolvis_payments
        (
            reference,
            email,
            plan,
            amount,
            status,
            xolvis_payload,
            user_id,
            binom_clickid,
            affiliate_source,
            traffic_source,
            sub_id,
            card_bin,
            card_type,
            last_four
        )
        VALUES
        (
            $1,$2,$3,$4,
            'BLOCKED',
            $5,$6,$7,$8,$9,$10,$11,$12,$13
        )

        ON CONFLICT (reference)
        DO NOTHING
        `,
        [
            reference,
            email,
            selectedPlan,
            amount,

            {
                result:
                    "BLOCKED",

                message:
                    "CARD_RETRY_LIMIT_REACHED",

                previousAttempts:
                    previousAttempts,

                cardBin:
                    cardBin || null,

                cardType:
                    cardType || null,

                lastFour:
                    cardLastFour || null,

                binCountry:
                    cardCountry || null
            },

            checkout.user_id || null,
            binomClickid || null,
            affiliateSource || null,
            trafficSource || null,
            subId || null,
            cardBin || null,
            cardType || null,
            cardLastFour || null
        ]
    );

    return res.json({
        success: true,

        returnType:
            "REDIRECT",

        redirectUrl:
            finalErrorUrl,

        code:
            "CARD_RETRY_LIMIT_REACHED"
    });
}


// --------------------------------------------
// BLOCK UNSUPPORTED CARD BRANDS
// --------------------------------------------

const normalizedCardType =
  String(cardType || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");

const supportedCardTypes = [
  "visa",
  "mastercard",
  "mastercarddebit",
  "mastercardcredit",
  "mc"
];

const isUnsupportedCardType =
  Boolean(normalizedCardType) &&
  !supportedCardTypes.includes(normalizedCardType);

if (isUnsupportedCardType) {
  console.warn("PAYMENT BLOCKED BY CARD TYPE RULE:", {
    cardType,
    normalizedCardType,
    bin: cardBin,
    lastFour: cardLastFour
  });

   await pool.query(
    `
    INSERT INTO xolvis_payments
    (
      reference,
      email,
      plan,
      amount,
      status,
      xolvis_payload,
      user_id,
      binom_clickid,
      affiliate_source,
      traffic_source,
      sub_id,
      card_bin,
      card_type,
      last_four
    )
    VALUES ($1, $2, $3, $4, 'BLOCKED', $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (reference) DO NOTHING
    `,
    [
      reference,
      email,
      selectedPlan,
      amount,
      {
        result: "BLOCKED",
        message: "CARD_TYPE_NOT_SUPPORTED",
        binCountry: cardCountry || null,
        cardType: cardType || null,
        cardBin: cardBin || null,
        lastFour: cardLastFour || null
      },
      checkout.user_id || null,
      binomClickid || null,
      affiliateSource || null,
      trafficSource || null,
      subId || null,
      cardBin || null,
      cardType || null,
      cardLastFour || null
    ]
  );

  return res.status(400).json({
    success: false,
    error:
      "Only Visa and Mastercard are accepted. Please use another card.",
    code: "CARD_TYPE_NOT_SUPPORTED"
  });
}

// --------------------------------------------
// CHECK CONFIGURED BLOCKED BINS
// --------------------------------------------

const blockedCardBins =
  String(process.env.BLOCKED_CARD_BINS || "")
    .split(",")
    .map(bin => bin.trim().replace(/\D/g, ""))
    .filter(Boolean);

const isBlockedBin =
  Boolean(cardBin) &&
  blockedCardBins.includes(cardBin);

if (isBlockedBin) {
  console.warn("PAYMENT BLOCKED BY BIN RULE:", {
    bin: cardBin,
    cardType,
    lastFour: cardLastFour
  });

  await pool.query(
    `

      INSERT INTO xolvis_payments
    (
      reference,
      email,
      plan,
      amount,
      status,
      xolvis_payload,
      user_id,
      binom_clickid,
            affiliate_source,
      traffic_source,
      sub_id,
      card_bin,
      card_type,
      last_four
    )
    VALUES ($1, $2, $3, $4, 'BLOCKED', $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (reference) DO NOTHING
    `,
    [
      reference,
      email,
      selectedPlan,
      amount,
      {
        result: "BLOCKED",
        message: "CARD_BIN_BLOCKED",
        binCountry: cardCountry || null,
        cardType: cardType || null,
        cardBin: cardBin || null,
        lastFour: cardLastFour || null
      },
      checkout.user_id || null,
      binomClickid || null,
      affiliateSource || null,
      trafficSource || null,
      subId || null,
      cardBin || null,
      cardType || null,
      cardLastFour || null
]
  );

  return res.status(400).json({
    success: false,
    error:
      "This card cannot be accepted. Please use another payment method.",
    code: "CARD_BIN_BLOCKED"
  });
}

await pool.query(
  `
  INSERT INTO xolvis_payments
  (
    reference,
    email,
    plan,
    amount,
    user_id,
    binom_clickid,
    affiliate_source,
    traffic_source,
    sub_id,
    card_bin,
    card_type,
    last_four
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  ON CONFLICT (reference) DO NOTHING
  `,
  [
    reference,
    email,
    selectedPlan,
    amount,
    checkout.user_id || null,
    binomClickid || null,
    affiliateSource || null,
    trafficSource || null,
    subId || null,
    cardBin || null,
    cardType || null,
    cardLastFour || null
  ]
);const trackingCallbackUrl =
  process.env.XOLVIS_CALLBACK_URL;

if (!trackingCallbackUrl) {
  return res.status(500).json({
    error: "XOLVIS_CALLBACK_URL is not configured"
  });
}

    const response = await fetch(
      `${process.env.XOLVIS_BASE_URL}/transaction/${process.env.XOLVIS_CONNECTOR_API_KEY}/debit`,
      {
        method: "POST",
        headers: {
          Authorization: getXolvisAuthHeader(),
          "Content-Type": "application/json; charset=utf-8",
          Accept: "application/json"
        },
        body: JSON.stringify({
          merchantTransactionId: reference,
          transactionToken: transactionToken,
          amount: amount.toFixed(2),
          currency: "GBP",
          description: "Speak to Heaven Access",
          successUrl: finalSuccessUrl,
cancelUrl: finalErrorUrl,
errorUrl: finalErrorUrl,
          callbackUrl: trackingCallbackUrl,
          customer: {
            email: email,
            firstName: checkout.first_name || "",
            lastName: checkout.last_name || "",
            ipAddress: req.ip || "127.0.0.1"
          },
          language: "en"
        })
      }
    );

    const rawText = await response.text();

    console.log("PROMO XOLVIS STATUS:", response.status);
    console.log("PROMO XOLVIS RAW RESPONSE:", rawText);

    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { raw: rawText };
    }

    await pool.query(
      `
      UPDATE xolvis_payments
      SET xolvis_payload = $1,
          xolvis_uuid = $2,
          status = $3
      WHERE reference = $4
      `,
      [data, data.uuid || null, data.returnType || "created", reference]
    );

    if (!response.ok || data.success === false || data.returnType === "ERROR") {
      return res.status(500).json({
        error: "Xolvis error",
        details: data
      });
    }

    res.json({
  ...data,
  amount: amount.toFixed(2),
  currency: "GBP",
  plan: selectedPlan,
  successUrl: finalSuccessUrl
});

  } catch (err) {
    console.error("Promo Xolvis payment error:", err);
    res.status(500).json({ error: "Could not create promo payment" });
  }
});

// --------------------------------------------
// ADMIN CHARGEBACK CSV UPLOAD
// --------------------------------------------

app.post(
  "/api/admin/chargebacks/upload",
  requireAdminPassword,
  chargebackUpload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No CSV file uploaded"
        });
      }

      const csvText =
        req.file.buffer.toString("utf8");

      const rows =
        parseChargebackCsv(csvText);

      if (!rows.length) {
        return res.status(400).json({
          success: false,
          error: "The CSV contains no chargeback rows"
        });
      }

      let imported = 0;
      let updated = 0;
      let skipped = 0;
      let matched = 0;

      for (const row of rows) {
        const caseId =
          String(
            row["Case ID/Scheme ID"] || ""
          ).trim();

        if (!caseId) {
          skipped++;
          continue;
        }

        const merchantName =
          String(
            row["Merchant Name"] || ""
          )
            .trim()
            .toUpperCase();

        if (merchantName !== "SPEAKTOHEAVEN.COM") {
          skipped++;
          continue;
        }

        const caseKind =
          String(
            row["Kind"] || ""
          )
            .trim()
            .toUpperCase();

        if (caseKind !== "CBK1") {
          skipped++;
          continue;
        }

        const {
          cardBin,
          lastFour
        } = getChargebackCardParts(
          row["Card No."]
        );

        const networkCode =
          String(
            row["Ntwk"] || ""
          )
            .trim()
            .toUpperCase();

        const csvCardType =
          networkCode === "VI"
            ? "VISA"
            : networkCode === "MC"
              ? "MASTERCARD"
              : networkCode || null;

        const transactionDate =
          parsePaystraxDate(
            row["Transaction Date"]
          );

        const amount =
          Number(
            row["Merchant Funding Amt Gr"] ||
            row["Netwk Sett Amt"] ||
            0
          );

        const currency =
          String(
            row["Merchant Funding Currency"] ||
            row["Netwk Sett Curr"] ||
            ""
          )
            .trim()
            .toUpperCase();

        let matchedPayment = null;

        if (
          cardBin &&
          lastFour &&
          Number.isFinite(amount)
        ) {
          const matchResult =
            await pool.query(
              `
              SELECT
                p.reference,
                p.email,
                p.plan,
                p.affiliate_source,
                p.amount,

                COALESCE(
                  p.card_type,
                  a.card_type
                ) AS card_type,

                COALESCE(
                  p.xolvis_payload #>> '{returnData,binCountry}',
                  p.xolvis_payload #>> '{returnData,binRawData,data,country_alpha2}',
                  p.xolvis_payload #>> '{customer,binCountry}',
                  p.xolvis_payload->>'binCountry'
                ) AS card_country

              FROM xolvis_payments p

              LEFT JOIN card_payment_attempts a
                ON a.payment_reference = p.reference

              WHERE
                LEFT(
                  REGEXP_REPLACE(
                    COALESCE(
                      p.card_bin,
                      a.card_bin,
                      ''
                    ),
                    '[^0-9]',
                    '',
                    'g'
                  ),
                  6
                ) = $1

                AND RIGHT(
                  REGEXP_REPLACE(
                    COALESCE(
                      p.last_four,
                      a.last_four,
                      ''
                    ),
                    '[^0-9]',
                    '',
                    'g'
                  ),
                  4
                ) = $2

                AND ABS(
                  COALESCE(p.amount, 0) - $3
                ) < 0.01

                AND (
                  UPPER(
                    COALESCE(
                      a.status,
                      ''
                    )
                  ) = 'SUCCESSFUL'

                  OR

                  UPPER(
                    COALESCE(
                      p.status,
                      ''
                    )
                  ) IN (
                    'FINISHED',
                    'OK',
                    'SUCCESSFUL'
                  )
                )

              ORDER BY
                COALESCE(
                  p.paid_at,
                  p.created_at
                ) DESC

              LIMIT 1
              `,
              [
                cardBin,
                lastFour,
                amount
              ]
            );

          if (matchResult.rows.length) {
            matchedPayment =
              matchResult.rows[0];

            matched++;
          }
        }        const existing =
          await pool.query(
            `
            SELECT id
            FROM chargebacks
            WHERE case_id = $1
            LIMIT 1
            `,
            [caseId]
          );

        await pool.query(
          `
          INSERT INTO chargebacks
          (
            case_id,
            status,
            network,
            card_bin,
            last_four,
            reason_code,
            dispute_condition,
            transaction_date,
            merchant_transaction_reference,
            merchant_name,
            currency,
            amount,
            matched_payment_reference,
            card_country,
            affiliate_source,
            plan,
            card_type,
            email
          )
          VALUES
          (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,
            $10,$11,$12,$13,$14,$15,$16,
            $17,$18
          )

          ON CONFLICT (case_id)
          DO UPDATE SET
            status = EXCLUDED.status,
            network = EXCLUDED.network,
            card_bin = EXCLUDED.card_bin,
            last_four = EXCLUDED.last_four,
            reason_code = EXCLUDED.reason_code,
            dispute_condition = EXCLUDED.dispute_condition,
            transaction_date = EXCLUDED.transaction_date,
            merchant_transaction_reference =
              EXCLUDED.merchant_transaction_reference,
            merchant_name = EXCLUDED.merchant_name,
            currency = EXCLUDED.currency,
            amount = EXCLUDED.amount,

            matched_payment_reference =
              COALESCE(
                EXCLUDED.matched_payment_reference,
                chargebacks.matched_payment_reference
              ),

            card_country =
              COALESCE(
                EXCLUDED.card_country,
                chargebacks.card_country
              ),

            affiliate_source =
              COALESCE(
                EXCLUDED.affiliate_source,
                chargebacks.affiliate_source
              ),

            plan =
              COALESCE(
                EXCLUDED.plan,
                chargebacks.plan
              ),

            card_type =
              COALESCE(
                EXCLUDED.card_type,
                chargebacks.card_type
              ),

            email =
              COALESCE(
                EXCLUDED.email,
                chargebacks.email
              )
          `,
          [
            caseId,
            row["Status"] || null,
            row["Ntwk"] || null,
            cardBin,
            lastFour,
            row["Reason Code"] || null,
            row["Dispute Condition"] || null,
            transactionDate,
            row["Merch Tran Ref."] || null,
            row["Merchant Name"] || null,
            currency || null,
            Number.isFinite(amount)
              ? amount
              : null,
            matchedPayment?.reference || null,
            matchedPayment?.card_country || null,
            matchedPayment?.affiliate_source || null,
            matchedPayment?.plan || null,
            matchedPayment?.card_type || csvCardType || null,
            matchedPayment?.email || null
          ]
        );

        if (existing.rows.length) {
          updated++;
        } else {
          imported++;
        }
      }

      return res.json({
        success: true,
        totalRows: rows.length,
        imported,
        updated,
        skipped,
        matched
      });

    } catch (error) {
      console.error(
        "Chargeback CSV import error:",
        error
      );

      return res.status(500).json({
        success: false,
        error: "Could not import chargeback CSV"
      });
    }
  }
);

// --------------------------------------------
// ADMIN CHARGEBACKS API
// --------------------------------------------

app.get(
  "/api/admin/chargebacks",
  requireAdminPassword,
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            id,
            case_id,
            status,
            network,
            card_bin,
            last_four,
            reason_code,
            dispute_condition,
            transaction_date,
            merchant_transaction_reference,
            merchant_name,
            currency,
            amount,
            matched_payment_reference,
            card_country,
            affiliate_source,
            plan,
            card_type,
            email,
            imported_at

          FROM chargebacks

          WHERE
            UPPER(
              TRIM(
                COALESCE(
                  merchant_name,
                  ''
                )
              )
            ) = 'SPEAKTOHEAVEN.COM'

          ORDER BY
            transaction_date DESC,
            imported_at DESC
          `
        );

      return res.json({
        success: true,
        chargebacks: result.rows
      });

    } catch (error) {
      console.error(
        "Admin chargebacks error:",
        error
      );

      return res.status(500).json({
        success: false,
        error: "Could not load chargebacks"
      });
    }
  }
);

// --------------------------------------------
// ADMIN FRAUD REPORT UPLOAD
// --------------------------------------------

app.post(
  "/api/admin/fraud/upload",
  requireAdminPassword,
  fraudUpload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No fraud Excel file uploaded"
        });
      }

      const workbook =
        new ExcelJS.Workbook();

      await workbook.xlsx.load(
        req.file.buffer
      );

      const worksheet =
        workbook.worksheets[0];

      if (!worksheet) {
        return res.status(400).json({
          success: false,
          error: "The Excel file contains no worksheet"
        });
      }

      const headers = [];

      worksheet
        .getRow(1)
        .eachCell(
          {
            includeEmpty: true
          },
          (cell, columnNumber) => {
            headers[columnNumber - 1] =
              String(
                getFraudExcelCellValue(
                  cell.value
                )
              )
                .trim()
                .toUpperCase();
          }
        );

      const requiredHeaders = [
        "GATEWAY_REFERENCE_1",
        "SEQUENCE_NUM",
        "CARD_ACCT_NO",
        "MERCH_NAME",
        "MID",
        "TXN_DATE",
        "FRAUD_TYPE",
        "ORIG_TXN_CCY",
        "ORIG_TXN_AMT"
      ];

      const missingHeaders =
        requiredHeaders.filter(
          header =>
            !headers.includes(header)
        );

      if (missingHeaders.length) {
        return res.status(400).json({
          success: false,
          error:
            "Fraud report is missing columns: " +
            missingHeaders.join(", ")
        });
      }

      const fraudRows = [];

      worksheet.eachRow(
        {
          includeEmpty: false
        },
        (row, rowNumber) => {
          if (rowNumber === 1) {
            return;
          }

          const item = {};

          headers.forEach(
            (header, index) => {
              if (!header) {
                return;
              }

              item[header] =
                getFraudExcelCellValue(
                  row.getCell(
                    index + 1
                  ).value
                );
            }
          );

          fraudRows.push(item);
        }
      );

      let imported = 0;
      let updated = 0;
      let skipped = 0;
      let ignoredOtherMerchant = 0;
      let matched = 0;

      for (const row of fraudRows) {
        const merchantName =
          String(
            row.MERCH_NAME || ""
          ).trim();

        const normalizedMerchantName =
          merchantName
            .replace(/\s+/g, "")
            .toLowerCase();

        const mid =
          String(
            row.MID || ""
          ).trim();

        const isSpeakToHeaven =
          normalizedMerchantName ===
            "speaktoheaven.com" ||
          mid ===
            "000106901001030";

        if (!isSpeakToHeaven) {
          ignoredOtherMerchant++;
          continue;
        }

        const maskedCard =
          String(
            row.CARD_ACCT_NO || ""
          ).trim();

        const {
          cardBin,
          lastFour
        } =
          getChargebackCardParts(
            maskedCard
          );

        const transactionDate =
          normalizeFraudExcelDate(
            row.TXN_DATE
          );

        const recordDate =
          normalizeFraudExcelDate(
            row.RECORD_DATE
          );

        const postDate =
          normalizeFraudExcelDate(
            row.POST_DATE
          );

        const originalAmount =
          Number(
            row.ORIG_TXN_AMT
          );

        const fraudAmountUsd =
          Number(
            row.FRAUD_AMT_USD
          );

        if (
          !cardBin ||
          !lastFour ||
          !transactionDate ||
          !Number.isFinite(
            originalAmount
          )
        ) {
          skipped++;
          continue;
        }

        let matchedPayment = null;

        const paymentMatch =
          await pool.query(
            `
            SELECT
              p.reference,
              p.email,
              p.plan,
              p.affiliate_source,

              COALESCE(
                NULLIF(
                  p.card_bin,
                  ''
                ),
                a.card_bin
              ) AS card_bin,

              COALESCE(
                NULLIF(
                  p.last_four,
                  ''
                ),
                a.last_four
              ) AS last_four,

              COALESCE(
                NULLIF(
                  p.card_type,
                  ''
                ),
                a.card_type
              ) AS card_type,

              COALESCE(
                p.xolvis_payload
                  #>>
                  '{returnData,binCountry}',

                p.xolvis_payload
                  #>>
                  '{returnData,binRawData,data,country_alpha2}',

                p.xolvis_payload
                  #>>
                  '{customer,binCountry}',

                p.xolvis_payload
                  ->>
                  'binCountry'
              ) AS card_country

            FROM xolvis_payments p

            LEFT JOIN card_payment_attempts a
              ON
                a.payment_reference =
                p.reference

            WHERE
              p.paid_at IS NOT NULL

              AND LEFT(
                REGEXP_REPLACE(
                  COALESCE(
                    NULLIF(
                      p.card_bin,
                      ''
                    ),
                    a.card_bin,
                    ''
                  ),
                  '[^0-9]',
                  '',
                  'g'
                ),
                6
              ) = $1

              AND RIGHT(
                REGEXP_REPLACE(
                  COALESCE(
                    NULLIF(
                      p.last_four,
                      ''
                    ),
                    a.last_four,
                    ''
                  ),
                  '[^0-9]',
                  '',
                  'g'
                ),
                4
              ) = $2

              AND ABS(
                p.amount -
                $3::numeric
              ) < 0.01

              AND p.created_at >=
                $4::date -
                INTERVAL '1 day'

              AND p.created_at <
                $4::date +
                INTERVAL '2 days'

            ORDER BY
              ABS(
                EXTRACT(
                  EPOCH FROM
                  (
                    p.created_at -
                    $4::date
                  )
                )
              )

            LIMIT 1
            `,
            [
              cardBin,
              lastFour,
              originalAmount,
              transactionDate
            ]
          );

        if (
          paymentMatch.rows.length
        ) {
          matchedPayment =
            paymentMatch.rows[0];

          matched++;
        }

        const gatewayReference =
          String(
            row.GATEWAY_REFERENCE_1 ||
            ""
          ).trim();

        const sequenceNumber =
          String(
            row.SEQUENCE_NUM ||
            ""
          ).trim();

        const existing =
          await pool.query(
            `
            SELECT id
            FROM fraud_reports

            WHERE
              gateway_reference = $1
              AND sequence_number = $2
              AND card_bin = $3
              AND last_four = $4
              AND transaction_date = $5
              AND original_amount = $6
            `,
            [
              gatewayReference,
              sequenceNumber,
              cardBin,
              lastFour,
              transactionDate,
              originalAmount
            ]
          );

        await pool.query(
          `
          INSERT INTO fraud_reports (
            gateway_reference,
            sequence_number,

            card_bin,
            last_four,
            card_scheme,

            merchant_name,
            mid,

            acquirer_reference,

            record_date,
            transaction_date,
            post_date,

            fraud_amount_usd,
            fraud_type,

            original_currency,
            original_amount,

            auth_code,
            file_reference,

            merchant_city,
            mcc,
            pos_entry,
            cap_method,

            matched_payment_reference,

            card_country,
            affiliate_source,
            plan,
            card_type,
            email
          )

          VALUES (
            $1, $2,
            $3, $4, $5,
            $6, $7,
            $8,
            $9, $10, $11,
            $12, $13,
            $14, $15,
            $16, $17,
            $18, $19, $20, $21,
            $22,
            $23, $24, $25, $26, $27
          )

          ON CONFLICT (
            gateway_reference,
            sequence_number,
            card_bin,
            last_four,
            transaction_date,
            original_amount
          )

          DO UPDATE SET
            card_scheme =
              EXCLUDED.card_scheme,

            merchant_name =
              EXCLUDED.merchant_name,

            mid =
              EXCLUDED.mid,

            acquirer_reference =
              EXCLUDED.acquirer_reference,

            record_date =
              EXCLUDED.record_date,

            post_date =
              EXCLUDED.post_date,

            fraud_amount_usd =
              EXCLUDED.fraud_amount_usd,

            fraud_type =
              EXCLUDED.fraud_type,

            original_currency =
              EXCLUDED.original_currency,

            auth_code =
              EXCLUDED.auth_code,

            file_reference =
              EXCLUDED.file_reference,

            merchant_city =
              EXCLUDED.merchant_city,

            mcc =
              EXCLUDED.mcc,

            pos_entry =
              EXCLUDED.pos_entry,

            cap_method =
              EXCLUDED.cap_method,

            matched_payment_reference =
              EXCLUDED.matched_payment_reference,

            card_country =
              EXCLUDED.card_country,

            affiliate_source =
              EXCLUDED.affiliate_source,

            plan =
              EXCLUDED.plan,

            card_type =
              EXCLUDED.card_type,

            email =
              EXCLUDED.email,

            imported_at =
              NOW()
          `,
          [
            gatewayReference,
            sequenceNumber,

            cardBin,
            lastFour,
            String(
              row.CARD_SCHEME || ""
            ).trim(),

            merchantName,
            mid,

            String(
              row.ACQ_REF_N || ""
            ).trim(),

            recordDate,
            transactionDate,
            postDate,

            Number.isFinite(
              fraudAmountUsd
            )
              ? fraudAmountUsd
              : null,

            String(
              row.FRAUD_TYPE || ""
            ).trim(),

            String(
              row.ORIG_TXN_CCY || ""
            ).trim(),

            originalAmount,

            String(
              row.AUTH_CODE || ""
            ).trim(),

            String(
              row.FILE_REFERENCE || ""
            ).trim(),

            String(
              row.MERCH_CITY || ""
            ).trim(),

            String(
              row.MCC || ""
            ).trim(),

            String(
              row.POS_ENTRY || ""
            ).trim(),

            String(
              row.CAP_MET || ""
            ).trim(),

            matchedPayment
              ?.reference ||
              null,

            matchedPayment
              ?.card_country ||
              null,

            matchedPayment
              ?.affiliate_source ||
              null,

            matchedPayment
              ?.plan ||
              null,

            matchedPayment
              ?.card_type ||
              null,

            matchedPayment
              ?.email ||
              null
          ]
        );

        if (existing.rows.length) {
          updated++;
        } else {
          imported++;
        }
      }

      return res.json({
        success: true,
        imported,
        updated,
        skipped,
        ignoredOtherMerchant,
        matched
      });

    } catch (error) {
      console.error(
        "Fraud Excel import error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Could not import fraud Excel report"
      });
    }
  }
);


// --------------------------------------------
// ADMIN FRAUD REPORTS API
// --------------------------------------------

app.get(
  "/api/admin/fraud",
  requireAdminPassword,
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            id,

            gateway_reference,
            sequence_number,

            card_bin,
            last_four,
            card_scheme,

            merchant_name,
            mid,

            acquirer_reference,

            record_date,
            transaction_date,
            post_date,

            fraud_amount_usd,
            fraud_type,

            original_currency,
            original_amount,

            auth_code,
            file_reference,

            merchant_city,
            mcc,
            pos_entry,
            cap_method,

            matched_payment_reference,

            card_country,
            affiliate_source,
            plan,
            card_type,
            email,

            imported_at

          FROM fraud_reports

          WHERE
            (
              LOWER(
                REPLACE(
                  COALESCE(
                    merchant_name,
                    ''
                  ),
                  ' ',
                  ''
                )
              ) = 'speaktoheaven.com'

              OR

              mid = '000106901001030'
            )

          ORDER BY
            transaction_date DESC,
            id DESC
          `
        );

      return res.json({
        success: true,
        fraudReports:
          result.rows
      });

    } catch (error) {
      console.error(
        "Fraud reports API error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Could not load fraud reports"
      });
    }
  }
);


// --------------------------------------------
// ADMIN TRANSACTIONS API
// --------------------------------------------

app.get(
  "/api/admin/transactions",
  requireAdminPassword,
  async (req, res) => {
    try {
      const result = await pool.query(`
  SELECT
    COALESCE(
      p.reference,
      a.payment_reference
    ) AS reference,

    COALESCE(
      p.email,
      a.email
    ) AS email,

    p.plan,
    p.amount,

    COALESCE(
      p.status,
      a.status
    ) AS payment_status,

    COALESCE(
      p.created_at,
      a.created_at
    ) AS created_at,

    p.paid_at,
p.xolvis_uuid,
p.affiliate_source,
p.traffic_source,
p.sub_id,

COALESCE(p.card_bin, a.card_bin) AS card_bin,
COALESCE(p.card_type, a.card_type) AS card_type,
COALESCE(p.last_four, a.last_four) AS last_four,
a.status AS attempt_status,
a.gateway_status,
COALESCE(
  p.xolvis_payload #>> '{returnData,binCountry}',
  p.xolvis_payload #>> '{returnData,binRawData,data,country_alpha2}',
  p.xolvis_payload #>> '{customer,binCountry}',
  p.xolvis_payload->>'binCountry'
) AS card_country,

COALESCE(
  p.xolvis_payload->>'adapterMessage',
  p.xolvis_payload->>'message',
  p.xolvis_payload->>'result',
  a.gateway_status,
  a.status,
  p.status
) AS reason

  FROM xolvis_payments p

  FULL OUTER JOIN card_payment_attempts a
    ON a.payment_reference = p.reference

  ORDER BY COALESCE(
    p.created_at,
    a.created_at
  ) DESC
`);

      res.json({
        success: true,
        transactions: result.rows
      });

    } catch (error) {
      console.error(
        "Admin transactions error:",
        error
      );

      res.status(500).json({
        success: false,
        error: "Could not load transactions"
      });
    }
  }
);

const frontendPath = path.join(__dirname, "public");

app.use(express.static(frontendPath));

// Inject footer links into every HTML page
app.use((req, res, next) => {
	const oldSend = res.send;

	res.send = function (data) {
		if (typeof data === "string" && data.includes("</body>")) {
			data = data.replace(
				"</body>",
				`
<footer style="
margin-top:40px;
padding:20px;
text-align:center;
font-size:14px;
color:#aaa;
border-top:1px solid rgba(0,0,0,0.1);
">
<a href="/privacy-policy.html">Privacy Policy</a> |
<a href="/terms-and-conditions.html">Terms & Conditions</a>
</footer>
</body>`
			);
		}
		return oldSend.call(this, data);
	};

	next();
});
//--------------------------------------------
//	OPENAI/OPENROUTER CLIENT
//--------------------------------------------

const openai = new OpenAI({	
	baseURL: "https://openrouter.ai/api/v1",
	apiKey: process.env.OPENROUTER_API_KEY,
	defaultHeaders: {
		'HTTP-Referer': 'https://www.speaktoheaven.com',	
		'X-Title': 'Speak to Heaven'	 	 	 	 	
	}
});

//--------------------------------------------
//	CHAT ROUTE (NOW DYNAMICALLY USES CHARACTER PROFILES)
//--------------------------------------------

app.get("/api/chat/history", async (req, res) => {
	try {
		const authHeader = req.headers.authorization;
		const token = authHeader && authHeader.split(" ")[1];
		if (!token) return res.status(401).json({ error: "No token" });
		const decoded = jwt.verify(token, SECRET_KEY);
		const userId = decoded.id;
		const { characterId } = req.query;

		const history = await pool.query(
			"SELECT * FROM messages WHERE user_id = $1 AND character_id = $2 ORDER BY created_at ASC LIMIT 50",
			[userId, characterId]
		);
		res.json(history.rows);
	} catch (err) {
		res.status(500).json({ error: "Failed to load history" });
	}
});

app.post("/api/chat", authenticateToken, async (req, res) => {
	try {
		const { characterId, message } = req.body;

		if (!characterId || !message)
			return res.status(400).json({ error: "Missing character or message" });

		const character = biblicalProfiles.find(c => c.id === Number(characterId));
		if (!character)
			return res.status(400).json({ error: "Invalid character" });

		const userId = req.user.id;

// 🔒 Check user access and free message limit
const userResult = await pool.query(
  "SELECT plan, lifetime, expires_at, messages_sent FROM users WHERE id = $1",
  [userId]
);

const userData = userResult.rows[0];

const isPaid =
  userData.lifetime ||
  (userData.expires_at &&
    new Date(userData.expires_at) > new Date());

// Free users get 3 messages before paywall
if (!isPaid && parseInt(userData.messages_sent) >= 3) {
  return res.status(403).json({
    error: "LIMIT_REACHED",
    message:
      "You have used your 3 free divine consultations. Please choose an offering to continue."
  });
}

// Paid users still respect plan restrictions
if (isPaid && !canAccessCharacter(userData, Number(characterId))) {
  return res.status(403).json({
    error: "NO_ACCESS",
    message: "You do not have access to this character."
  });
}
		// Save user message
		await pool.query(
			`INSERT INTO messages (user_id, character_id, from_user, text)
			 VALUES ($1, $2, true, $3)`,
			[userId, characterId, message]
		);

		// Load chat history
		const history = await pool.query(
			`SELECT * FROM messages
			 WHERE user_id = $1 AND character_id = $2
			 ORDER BY created_at ASC
			 LIMIT 20`,
			[userId, characterId]
		);

		const chatHistory = history.rows.map(m => ({
			role: m.from_user ? "user" : "assistant",
			content: m.text
		}));

		// 🔑 NEW: Dynamically set the system prompt based on the character's description
		const systemPrompt = `
You are ${character.name}, a biblical figure.

${character.description}

RULES:
- Speak in a biblical tone.
- Do NOT say you are an AI.
- Do NOT mention modern technology.
- Stay fully in character as ${character.name}.
- Speak with wisdom, authority, or humility appropriate to this figure.
- Give spiritual and reflective answers.

Remain in character at all times.
`;

		// Send to OpenRouter/OpenAI
		const aiResponse = await openai.chat.completions.create({	
			model: "openai/gpt-3.5-turbo",	
			messages: [
				{ role: "system", content: systemPrompt }, 
				...chatHistory,
				{ role: "user", content: message }
			],
			temperature: 0.7,
			max_tokens: 400
		});

		const reply = aiResponse.choices?.[0]?.message?.content;

		// Save assistant reply
		if (reply) {
			await pool.query(
				`INSERT INTO messages (user_id, character_id, from_user, text)
				 VALUES ($1, $2, false, $3)`,
				[userId, characterId, reply]
			);
		}

// Increment free message counter
				if (!isPaid) {
			await pool.query("UPDATE users SET messages_sent = messages_sent + 1 WHERE id = $1", [userId]);
		}

		res.json({ reply: reply || "(No response)" });

	} catch (err) {
		console.error("DEBUG ERROR:", err);
		res.status(500).json({ error: "Server Error: " + (err.message || "Unknown") });
	}
});

//--------------------------------------------
//	FETCH MESSAGES ROUTE
//--------------------------------------------

app.get("/api/messages/:characterId", authenticateToken, async (req, res) => {
	try {
		const { characterId } = req.params;

		const result = await pool.query(
			`SELECT * FROM messages
			 WHERE user_id = $1 AND character_id = $2
			 ORDER BY created_at ASC`,
			[req.user.id, characterId]
		);

		res.json(result.rows);
	} catch (err) {
		console.error("Fetch messages error:", err);
		res.status(500).json({ error: "Server error" });
	}
});

app.get("/xolvis-webhook", (req, res) => {
  console.log("XOLVIS WEBHOOK GET TEST");
  res.send("Xolvis webhook endpoint is reachable");
});

app.post("/xolvis-webhook", async (req, res) => {
  try {
    const data = req.body;

    console.log("XOLVIS WEBHOOK:");
    console.log(JSON.stringify(data, null, 2));

    const reference =
      data?.merchantTransactionId ||
      data?.merchantTransactionID ||
      data?.transaction?.merchantTransactionId ||
      data?.reference ||
      null;

    const uuid =
      data?.uuid ||
      data?.transactionUuid ||
      data?.transaction?.uuid ||
      null;

    const status =
  data?.result ||
  data?.returnType ||
  data?.status ||
  data?.transaction?.status ||
  "UNKNOWN";

const isSuccessful =
  data?.result === "OK" ||
  data?.returnType === "FINISHED" ||
  data?.status === "FINISHED" ||
  data?.transaction?.status === "FINISHED";

    if (!reference && !uuid) {
      console.error("XOLVIS WEBHOOK: Missing reference/uuid");
      return res.status(400).json({
        error: "Missing payment reference"
      });
    }

    const paymentResult = await pool.query(
      `
      SELECT *
      FROM xolvis_payments
      WHERE reference = $1
         OR xolvis_uuid = $2
      LIMIT 1
      `,
      [
        reference,
        uuid
      ]
    );

    if (paymentResult.rows.length === 0) {
      console.error("Payment not found:", reference, uuid);

      return res.json({
        ok: true
      });
    }

    const payment = paymentResult.rows[0];

    const wasAlreadyPaid =
      payment.paid_at != null;

    await pool.query(
      `
      UPDATE xolvis_payments
      SET
        status = $1,
        xolvis_payload = $2,
        xolvis_uuid = COALESCE($3, xolvis_uuid),
        paid_at =
          CASE
            WHEN $4 THEN NOW()
            ELSE paid_at
          END
      WHERE id = $5
      `,
      [
        status,
        data,
        uuid,
        isSuccessful,
payment.id
      ]
    );

await pool.query(
  `
  UPDATE card_payment_attempts
  SET
    status = $1,
    gateway_status = $2,
    updated_at = NOW()
  WHERE payment_reference = $3
  `,
  [
    isSuccessful ? "SUCCESSFUL" : "FAILED",
    status,
    payment.reference
  ]
);

    if (!isSuccessful) {
  return res.json({
    ok: true
  });
}

if (wasAlreadyPaid) {
  console.log(
    "XOLVIS WEBHOOK: Successful payment already processed, skipping duplicate:",
    payment.reference
  );

  return res.json({
    ok: true
  });
}

    let accessPlan = "god";
    let days = 30;

    if (payment.plan === "3595") {
      accessPlan = "all";
      days = 30;
    }

    if (
      payment.plan === "4995" ||
      payment.plan === "lifetime"

    ) {
      accessPlan = "all";
      days = 90;
    }

    const expiresAt = new Date();
    expiresAt.setDate(
      expiresAt.getDate() + days
    );

    const updateResult = await pool.query(
  `
  UPDATE users
  SET
    plan = $1,
    expires_at = $2,
    lifetime = false,
    messages_sent = 0
  WHERE
    (
      $3::integer IS NOT NULL
      AND id = $3
    )
    OR
    (
      $3::integer IS NULL
      AND LOWER(email) = LOWER($4)
    )
  RETURNING *
  `,
  [
    accessPlan,
    expiresAt,
    payment.user_id || null,
    payment.email
  ]
);

    if (updateResult.rows.length === 0) {
      console.error(
        "User not found:",
        payment.email
      );
    }

    try {
      const productName =
        getReceiptProductName(
          payment.plan
        );

      const firstName =
        data?.customer?.firstName ||
        "";

      const lastName =
        data?.customer?.lastName ||
        "";

      const customerName =
        `${firstName} ${lastName}`.trim() ||
        data?.returnData?.cardHolder ||
        "Customer";

      let paymentMethod =
        data?.paymentMethod ||
        "Credit Card";

      if (
        String(paymentMethod)
          .toLowerCase() ===
        "creditcard"
      ) {
        paymentMethod =
          "Credit Card";
      }

      const receiptNumber =
        "STH-" +
        String(payment.id)
          .padStart(6, "0");

      const receiptPdf =
        await makeReceiptPdf({
          receiptNumber,
          customerName,
          email: payment.email,
          productName,
          amount: payment.amount,
          paymentMethod,
          reference: payment.reference
        });

      await uploadReceiptToR2({
        pdfBuffer: receiptPdf,
        receiptNumber
      });

      await sendEmail(
        payment.email,
        "Your SpeakToHeaven.com receipt",
        `
        <h2>Payment received</h2>

        <p>Thank you for your payment.</p>

        <p>
        <strong>Product:</strong>
        ${productName}
        </p>

        <p>
        <strong>Amount:</strong>
        £${Number(payment.amount).toFixed(2)}
        </p>

        <p>Your payment receipt is attached.</p>
        `,
        [
          {
            filename:
              `${receiptNumber}.pdf`,
            content:
              receiptPdf.toString("base64")
          }
        ]
      );

      console.log(
        "✅ RECEIPT PROCESS COMPLETE:",
        receiptNumber
      );

    } catch (receiptError) {
      console.error(
        "❌ RECEIPT PROCESS FAILED:",
        receiptError
      );
    }

    res.json({
      ok: true
    });

  } catch (err) {

    console.error(
      "Xolvis webhook error:",
      err
    );

    res.status(500).json({
      error: "Webhook error"
    });
  }
});
app.get("/test-receipt-email", async (req, res) => {
  try {
    const email =
      "markvanstratum67@gmail.com";

    const receiptNumber =
      "STH-TEST-" +
      Date.now();

    const receiptPdf =
      await makeReceiptPdf({
        receiptNumber,
        customerName:
          "Test Customer",
        email,
        productName:
          "SpeakToHeaven.com 3 Month Full Access",
        amount:
          49.95,
        paymentMethod:
          "Credit Card",
        reference:
          "TEST-PAYMENT"
      });

    const r2Key =
      await uploadReceiptToR2({
        pdfBuffer:
          receiptPdf,
        receiptNumber
      });

    await sendEmail(
      email,
      "TEST SpeakToHeaven.com Receipt",
      `
        <h2>SpeakToHeaven.com receipt test</h2>
        <p>This is a test payment receipt.</p>
        <p><strong>Product:</strong> SpeakToHeaven.com 3 Month Full Access</p>
        <p><strong>Amount:</strong> £49.95</p>
      `,
      [
        {
          filename:
            `${receiptNumber}.pdf`,
          content:
            receiptPdf.toString("base64")
        }
      ]
    );

    res.json({
      success: true,
      receiptNumber,
      r2Key
    });

  } catch (error) {
    console.error(
      "TEST RECEIPT ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      error:
        String(
          error?.message ||
          error
        )
    });
  }
});
app.get("/", (req, res) => {
	res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Speak To Heaven</title>
<meta name="viewport" content="width=device-width, initial-scale=1">

<style>
body{
font-family: Arial;
background:#0f172a;
color:white;
text-align:center;
padding:60px;
}

footer{
margin-top:60px;
opacity:.7;
font-size:14px;
}

a{
color:#60a5fa;
text-decoration:none;
margin:0 10px;
}
</style>
</head>

<body>

<h1>Speak To Heaven</h1>

<p>Your AI biblical conversation platform.</p>

<footer>
<a href="/privacy-policy.html">Privacy Policy</a> |
<a href="/terms-and-conditions.html">Terms & Conditions</a>
</footer>

</body>
</html>
`);
});

//--------------------------------------------
// LEGAL PAGES
//--------------------------------------------

app.get("/privacy-policy", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "privacy-policy.html"));
});

app.get("/terms", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "terms-and-conditions.html"));
});
//--------------------------------------------
//	404 HANDLER
//--------------------------------------------

app.use((req, res) => {
	res.status(404).json({ error: "Endpoint not found" });
});

//--------------------------------------------
//	SERVER START
//--------------------------------------------

app.listen(PORT, () => {
	console.log("======================================");
	console.log("📖 HOLY CHAT SERVER RUNNING");
	console.log(`🌍 Port: ${PORT}`);
	console.log("======================================");
});