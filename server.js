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

function makeReceiptPdfBase64({ email, plan, amount }) {
  const date = new Date().toLocaleDateString("en-US");
  const invoiceNumber = "STH-" + Date.now();
  const amountText = "£" + Number(amount).toFixed(2);

  const lines = [
    { text: "SPEAK TO HEAVEN", size: 22, x: 72, y: 720 },
    { text: "Official Payment Receipt", size: 16, x: 72, y: 690 },

    { text: "Invoice Number: " + invoiceNumber, size: 11, x: 72, y: 640 },
    { text: "Date: " + date, size: 11, x: 72, y: 620 },

    { text: "Billed To:", size: 13, x: 72, y: 575 },
    { text: email, size: 11, x: 72, y: 555 },

    { text: "Company:", size: 13, x: 72, y: 510 },
{ text: "RIDGWELL SERVICES LIMITED", size: 11, x: 72, y: 490 },
{ text: "Company No: 16277582", size: 11, x: 72, y: 472 },
{ text: "85 Great Portland Street", size: 11, x: 72, y: 454 },
{ text: "First Floor", size: 11, x: 72, y: 436 },
{ text: "London, W1W 7LT", size: 11, x: 72, y: 418 },

    { text: "Description", size: 12, x: 72, y: 390 },
    { text: "Plan", size: 12, x: 300, y: 390 },
    { text: "Amount", size: 12, x: 450, y: 390 },

    { text: "Speak to Heaven Access", size: 11, x: 72, y: 360 },
    { text: plan, size: 11, x: 300, y: 360 },
    { text: amountText, size: 11, x: 450, y: 360 },

    { text: "Total Paid: " + amountText, size: 15, x: 360, y: 300 },

    { text: "Payment Status: Paid", size: 12, x: 72, y: 250 },
    { text: "Thank you for your offering.", size: 12, x: 72, y: 220 },
    { text: "This receipt confirms your successful payment.", size: 10, x: 72, y: 200 }
  ];

  function escapePdfText(str) {
    return String(str)
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  const content = lines.map(line =>
    `BT /F1 ${line.size} Tf ${line.x} ${line.y} Td (${escapePdfText(line.text)}) Tj ET`
  ).join("\n");

  const pdf =
`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${content.length} >>
stream
${content}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF`;

  return Buffer.from(pdf).toString("base64");
}
app.use(cors());

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
          language: "en"
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

console.log("✅ Xolvis payments table ready");
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

app.post("/api/upload", authenticateToken, upload.single("file"), (req, res) => {
	if (!req.file)
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
      originalQueryString
    } = req.body || {};

    if (!email) {
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
        ip,
        user_agent,
        expires_at
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      `,
      [
        token,
        step2File || "sth-fi-uk2.html",
        plan || "lifetime",
        firstName || null,
        lastName || null,
        name || null,
        email,
        `${phonePrefix || ""}${phone || ""}`,
        address || null,
        postcode || null,
        city || null,
        country || "United Kingdom",
        ref || null,
        sourcePage || null,
        originalQueryString || null,
        req.ip,
        req.headers["user-agent"] || "",
        expiresAt
      ]
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
    const { checkoutToken, cardholderName, transactionToken } = req.body || {};

    if (!checkoutToken) {
      return res.status(400).json({ error: "Missing checkout token" });
    }

    if (!transactionToken) {
      return res.status(400).json({ error: "Missing Xolvis transaction token" });
    }

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

    const reference = `promo-${selectedPlan}-${Date.now()}`;

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
          successUrl: process.env.XOLVIS_SUCCESS_URL,
          cancelUrl: process.env.XOLVIS_CANCEL_URL,
          errorUrl: process.env.XOLVIS_ERROR_URL,
          callbackUrl: process.env.XOLVIS_CALLBACK_URL,
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
      plan: selectedPlan
    });

  } catch (err) {
    console.error("Promo Xolvis payment error:", err);
    res.status(500).json({ error: "Could not create promo payment" });
  }
});

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
      data?.returnType ||
      data?.status ||
      data?.transaction?.status ||
      "UNKNOWN";

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
        status === "FINISHED",
        payment.id
      ]
    );

    if (status !== "FINISHED") {
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
      WHERE LOWER(email) = LOWER($3)
      RETURNING *
      `,
      [
        accessPlan,
        expiresAt,
        payment.email
      ]
    );

    if (updateResult.rows.length === 0) {
      console.error(
        "User not found:",
        payment.email
      );

      return res.json({
        ok: true
      });
    }

    const receiptPdf =
      makeReceiptPdfBase64({
        email: payment.email,
        plan: accessPlan,
        amount: payment.amount
      });

    await sendEmail(
      payment.email,
      "Your Speak to Heaven receipt",
      `
      <h2>Payment received</h2>

      <p>Thank you for your offering.</p>

      <p>
      <strong>Plan:</strong>
      ${accessPlan}
      </p>

      <p>
      <strong>Amount:</strong>
      £${Number(payment.amount).toFixed(2)}
      </p>
      `,
      [
        {
          filename:
            "speak-to-heaven-receipt.pdf",
          content: receiptPdf
        }
      ]
    );

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
  const email = "markvanstratum67@gmail.com";

  const receiptPdf = makeReceiptPdfBase64({
    email,
    plan: "lifetime",
    amount: 49.95
  });

  await sendEmail(
    email,
    "TEST Receipt",
    "<h2>Thank you for your order with SpeakToHeaven.com</h2>" +
"<p>We have received your payment successfully.</p>" +
"<p>Your receipt is attached to this email as a PDF.</p>" +
"<p><strong>Plan:</strong> Lifetime Access</p>" +
"<p><strong>Amount paid:</strong> £49.95</p>",
[
      {
        filename: "receipt.pdf",
        content: receiptPdf
      }
    ]
  );

  res.send("Test email sent");
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