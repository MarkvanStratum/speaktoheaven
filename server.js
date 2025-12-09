//--------------------------------------------
//  SERVER.JS — BIBLICAL AI CHAT EDITION
//--------------------------------------------

import express from "express";
import cors from "cors";
import OpenAI from "openai";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pkg from "pg";
import Stripe from "stripe";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import fs from "fs";
import multer from "multer";

//--------------------------------------------
//  BASIC SETUP
//--------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || "supersecret";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());

// Stripe webhook: raw body
app.use((req, res, next) => {
  if (req.originalUrl === "/webhook") {
    express.raw({ type: "application/json" })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

//--------------------------------------------
//  DATABASE
//--------------------------------------------

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize essential DB tables
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
        reset_token_expires TIMESTAMP
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
  } catch (err) {
    console.error("❌ DB Init error:", err);
  }
})();

//--------------------------------------------
//  BIBLICAL CHARACTER PROFILES
//--------------------------------------------

export const biblicalProfiles = [
  { id: 1, name: "God", image: "/img/god.png", description: "Creator, Eternal, Almighty." },
  { id: 2, name: "Jesus Christ", image: "/img/jesus.png", description: "Teacher, Savior, Son of God." },
  { id: 3, name: "Holy Spirit", image: "/img/holyspirit.png", description: "Comforter, Advocate, Helper." },
  { id: 4, name: "Mary", image: "/img/mary.png", description: "Mother of Jesus, blessed among women." },
  { id: 5, name: "Moses", image: "/img/moses.png", description: "Prophet, leader of Israel." },
  { id: 6, name: "Abraham", image: "/img/abraham.png", description: "Father of faith." },
  { id: 7, name: "Isaac", image: "/img/isaac.png", description: "Child of promise." },
  { id: 8, name: "Jacob", image: "/img/jacob.png", description: "Father of the twelve tribes." },
  { id: 9, name: "Noah", image: "/img/noah.png", description: "Builder of the ark." },
  { id: 10, name: "Adam", image: "/img/adam.png", description: "First man." },
  { id: 11, name: "Eve", image: "/img/eve.png", description: "Mother of all living." },
  { id: 12, name: "King David", image: "/img/david.png", description: "Poet, warrior, king." },
  { id: 13, name: "Solomon", image: "/img/solomon.png", description: "King of wisdom." },
  { id: 14, name: "Isaiah", image: "/img/isaiah.png", description: "Major prophet." },
  { id: 15, name: "Jeremiah", image: "/img/jeremiah.png", description: "Prophet of warning and hope." },
  { id: 16, name: "Ezekiel", image: "/img/eze.png", description: "Prophet of visions." },
  { id: 17, name: "Daniel", image: "/img/daniel.png", description: "Interpreter of dreams." },
  { id: 18, name: "Elijah", image: "/img/elijah.png", description: "Prophet of fire." },
  { id: 19, name: "Elisha", image: "/img/elisha.png", description: "Prophet of compassion." },
  { id: 20, name: "Job", image: "/img/job.png", description: "Man of endurance." },
  { id: 21, name: "Samuel", image: "/img/samuel.png", description: "Prophet who anointed kings." },
  { id: 22, name: "Ruth", image: "/img/ruth.png", description: "Model of loyalty." },
  { id: 23, name: "Esther", image: "/img/esther.png", description: "Queen who saved Israel." },
  { id: 24, name: "Apostle Peter", image: "/img/peter.png", description: "Bold apostle." },
  { id: 25, name: "Apostle Paul", image: "/img/paul.png", description: "Teacher and missionary." },
  { id: 26, name: "Apostle John", image: "/img/john.png", description: "Apostle of love." }
];

app.get("/api/profiles", (req, res) => {
  res.json(biblicalProfiles);
});

//--------------------------------------------
//  AUTH HELPERS
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
//  AUTH: REGISTER
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

    const hashed = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (email, password) VALUES ($1, $2)`,
      [email, hashed]
    );

    res.status(201).json({ ok: true, message: "Registered successfully" });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

//--------------------------------------------
//  AUTH: LOGIN
//--------------------------------------------

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0)
      return res.status(400).json({ error: "Invalid credentials" });

    const user = result.rows[0];

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      SECRET_KEY,
      { expiresIn: "7d" }
    );

    res.json({ token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

//--------------------------------------------
//  PASSWORD RESET — REQUEST LINK
//--------------------------------------------

app.post("/api/request-password-reset", async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email required" });

  try {
    const result = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0)
      return res.status(400).json({ error: "No account with that email" });

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 30 * 60 * 1000);

    await pool.query(
      `
      UPDATE users
      SET reset_token = $1,
          reset_token_expires = $2
      WHERE email = $3
    `,
      [token, expires, email]
    );

    res.json({ message: "If the email exists, a reset link has been sent" });
  } catch (err) {
    console.error("Reset error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

//--------------------------------------------
//  PASSWORD RESET — APPLY NEW PASSWORD
//--------------------------------------------

app.post("/api/reset-password", async (req, res) => {
  const { token, password } = req.body || {};

  if (!token || !password)
    return res.status(400).json({ error: "Missing token or password" });

  try {
    const result = await pool.query(
      `SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()`,
      [token]
    );

    if (result.rows.length === 0)
      return res.status(400).json({ error: "Invalid or expired token" });

    const hashed = await bcrypt.hash(password, 10);

    await pool.query(
      `
      UPDATE users
      SET password = $1,
          reset_token = NULL,
          reset_token_expires = NULL
      WHERE reset_token = $2
    `,
      [hashed, token]
    );

    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error("Reset-password error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

//--------------------------------------------
//  GET USER CREDITS
//--------------------------------------------

app.get("/api/credits", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT credits, lifetime FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "User not found" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Credit fetch error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

//--------------------------------------------
//  FETCH ALL MESSAGES (GROUPED)
//--------------------------------------------

app.get("/api/messages", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT * FROM messages
      WHERE user_id = $1
      ORDER BY created_at ASC
    `,
      [req.user.id]
    );

    const grouped = {};
    for (const msg of result.rows) {
      if (!grouped[msg.character_id]) grouped[msg.character_id] = [];

      grouped[msg.character_id].push({
        from: msg.from_user ? "user" : "character",
        text: msg.text,
        time: msg.created_at
      });
    }

    res.json(grouped);
  } catch (err) {
    console.error("Fetch messages error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

//--------------------------------------------
//  FETCH MESSAGES FOR ONE CHARACTER
//--------------------------------------------

app.get("/api/messages/:characterId", authenticateToken, async (req, res) => {
  try {
    const { characterId } = req.params;

    const result = await pool.query(
      `
      SELECT * FROM messages
      WHERE user_id = $1 AND character_id = $2
      ORDER BY created_at ASC
    `,
      [req.user.id, characterId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Fetch conversation error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

//--------------------------------------------
//  COUNT USER MESSAGES
//--------------------------------------------

async function userMessageCount(userId) {
  const result = await pool.query(
    `
    SELECT COUNT(*) FROM messages
    WHERE user_id = $1 AND from_user = true
  `,
    [userId]
  );
  return Number(result.rows[0].count);
}

//--------------------------------------------
//  SYSTEM PROMPTS
//--------------------------------------------

function buildSystemPrompt(characterName) {
  return `
You are roleplaying as **${characterName}**, a Biblical figure.

- Speak in the tone and personality of ${characterName}.
- Use Biblical wisdom and encouragement.
- Reference scripture when relevant.
- Never claim to literally be God; clarify you are an AI representation inspired by scripture.
- Avoid harmful or inappropriate content.
`;
}

function buildCharacterIntro(characterName) {
  const intros = {
    "God": "You speak with supreme authority, wisdom, and patience.",
    "Jesus Christ": "You speak with compassion, mercy, and truth.",
    "Holy Spirit": "You speak as a gentle counselor.",
    "Mary": "You speak with humility and comfort.",
    "Moses": "You speak firmly as a leader.",
    "Abraham": "You speak as a father of faith.",
    "Solomon": "You speak with profound wisdom.",
    "King David": "You speak poetically.",
    "Apostle Paul": "You speak like a teacher.",
    "Apostle John": "You speak lovingly."
  };

  return intros[characterName] || "";
}

//--------------------------------------------
//  OPENROUTER CLIENT
//--------------------------------------------

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
});

//--------------------------------------------
//  POST /api/chat — MAIN CHAT
//--------------------------------------------

app.post("/api/chat", authenticateToken, async (req, res) => {
  try {
    const { characterId, message } = req.body;
    if (!characterId || !message)
      return res.status(400).json({ error: "Missing character or message" });

    const character = biblicalProfiles.find(c => c.id === Number(characterId));
    if (!character)
      return res.status(400).json({ error: "Invalid character" });

    const userId = req.user.id;

    //--------------------------------------------
    // FREE / CREDIT LOGIC
    //--------------------------------------------

    const count = await userMessageCount(userId);

    const userData = await pool.query(
      "SELECT credits, lifetime FROM users WHERE id = $1",
      [userId]
    );

    const { credits, lifetime } = userData.rows[0];
    const hasPaid = lifetime || credits > 0;

    if (count >= 5 && !hasPaid) {
      return res.status(403).json({ error: "Free limit reached. Please buy credits." });
    }

    if (!lifetime && count >= 5) {
      if (credits <= 0)
        return res.status(403).json({ error: "No credits remaining." });

      await pool.query(
        "UPDATE users SET credits = credits - 1 WHERE id = $1",
        [userId]
      );
    }

    //--------------------------------------------
    // SAVE USER MESSAGE
    //--------------------------------------------

    await pool.query(
      `
      INSERT INTO messages (user_id, character_id, from_user, text)
      VALUES ($1, $2, true, $3)
    `,
      [userId, characterId, message]
    );

    //--------------------------------------------
    // LOAD LAST 20 MESSAGES
    //--------------------------------------------

    const historyQuery = await pool.query(
      `
      SELECT * FROM messages
      WHERE user_id = $1 AND character_id = $2
      ORDER BY created_at ASC
      LIMIT 20
    `,
      [userId, characterId]
    );

    const chatHistory = historyQuery.rows.map(m => ({
      role: m.from_user ? "user" : "assistant",
      content: m.text
    }));

    //--------------------------------------------
    // AI RESPONSE
    //--------------------------------------------

    const systemPrompt = buildSystemPrompt(character.name);
    const intro = buildCharacterIntro(character.name);

    const aiResponse = await openrouter.chat.completions.create({
      model: "google/gemini-2.0-flash-thinking-exp:free",
      messages: [
        { role: "system", content: systemPrompt + "\n" + intro },
        ...chatHistory,
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 600
    });

    const reply = aiResponse?.choices?.[0]?.message?.content || "…";

    //--------------------------------------------
    // SAVE AI RESPONSE
    //--------------------------------------------

    await pool.query(
      `
      INSERT INTO messages (user_id, character_id, from_user, text)
      VALUES ($1, $2, false, $3)
    `,
      [userId, characterId, reply]
    );

    res.json({ reply });

  } catch (err) {
    console.error("AI Chat error:", err);
    res.status(500).json({ error: "AI service error" });
  }
});

//--------------------------------------------
//  STRIPE: BUY CREDITS (ONE-TIME PAYMENT)
//--------------------------------------------

app.post("/api/buy-credits", authenticateToken, async (req, res) => {
  try {
    const { priceId } = req.body;

    if (!priceId)
      return res.status(400).json({ error: "Missing priceId" });

    const user = await pool.query(
      "SELECT email FROM users WHERE id = $1",
      [req.user.id]
    );

    const email = user.rows[0].email;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/credits-success`,
      cancel_url: `${process.env.FRONTEND_URL}/credits-cancel`,
      metadata: {
        userId: req.user.id.toString(),
        purchaseType: "credits"
      }
    });

    res.json({ sessionId: session.id });

  } catch (err) {
    console.error("Buy credits error:", err);
    res.status(500).json({ error: "Stripe error" });
  }
});

//--------------------------------------------
//  STRIPE WEBHOOK: ADD CREDITS AFTER PAYMENT
//--------------------------------------------

app.post("/webhook", async (req, res) => {
  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_CREDITS_WEBHOOK_SECRET
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const userId = session.metadata?.userId;
      const purchaseType = session.metadata?.purchaseType;

      if (purchaseType === "credits") {
        // Map Stripe price IDs → # of credits you want to give
        const CREDIT_PACKS = {
          "price_10credits": 10,
          "price_25credits": 25,
          "price_50credits": 60
        };

        const priceId = session?.line_items?.[0]?.price?.id;
        const credits = CREDIT_PACKS[priceId];

        if (credits && userId) {
          await pool.query(
            "UPDATE users SET credits = credits + $1 WHERE id = $2",
            [credits, userId]
          );

          console.log(`Added ${credits} credits to user ${userId}`);
        }
      }
    }

    res.sendStatus(200);

  } catch (err) {
    console.error("Credits webhook error:", err);
    res.sendStatus(400);
  }
});

//--------------------------------------------
//  FILE UPLOADS
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

  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

app.use("/uploads", express.static(uploadsDir));

//--------------------------------------------
//  SERVE STATIC IMAGES
//--------------------------------------------

app.use("/img", express.static(path.join(__dirname, "public/img")));

//--------------------------------------------
//  SERVE FRONTEND BUILD
//--------------------------------------------

const frontendPath = path.join(__dirname, "public");
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

//--------------------------------------------
//  404 HANDLER
//--------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    path: req.originalUrl
  });
});

//--------------------------------------------
//  GLOBAL ERROR HANDLER
//--------------------------------------------

app.use((err, req, res, next) => {
  console.error("🔥 SERVER ERROR:", err);
  res.status(500).json({ error: "Internal server error" });
});

//--------------------------------------------
//  SERVER START
//--------------------------------------------

app.listen(PORT, () => {
  console.log("======================================");
  console.log(`📖 HOLY CHAT SERVER RUNNING`);
  console.log(`🌍 Port: ${PORT}`);
  console.log(`🕊 Mode: ${process.env.NODE_ENV || "development"}`);
  console.log("======================================");
});

//--------------------------------------------
//  GRACEFUL SHUTDOWN
//--------------------------------------------

process.on("SIGTERM", () => {
  console.log("SIGTERM received — shutting down gracefully...");
  serverClose();
});

process.on("SIGINT", () => {
  console.log("SIGINT received — shutting down gracefully...");
  serverClose();
});

function serverClose() {
  try {
    console.log("Closing database pool...");
    pool.end();
  } catch (e) {
    console.error("Error closing DB:", e);
  }

  console.log("Shutdown complete.");
  process.exit(0);
}
