//--------------------------------------------
//  SERVER.JS — BIBLICAL AI CHAT EDITION (FINAL FIXED)
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

// Stripe webhook handling
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
  { id: 1, name: "God", image: "/img/god.jpg", description: "Creator, Eternal, Almighty." },
  { id: 2, name: "Jesus Christ", image: "/img/jesus.jpg", description: "Teacher, Savior, Son of God." },
  { id: 3, name: "Holy Spirit", image: "/img/holyspirit.jpg", description: "Comforter, Advocate, Helper." },
  { id: 4, name: "Mary", image: "/img/mary.jpg", description: "Mother of Jesus, blessed among women." },
  { id: 5, name: "Moses", image: "/img/moses.jpg", description: "Prophet, leader of Israel." },
  { id: 11, name: "Eve", image: "/img/eve.jpg", description: "Mother of all living." },
  { id: 12, name: "King David", image: "/img/david.jpg", description: "Poet, warrior, king." },
  { id: 14, name: "Isaiah", image: "/img/isaiah.jpg", description: "Major prophet." },
  { id: 17, name: "Daniel", image: "/img/daniel.jpg", description: "Interpreter of dreams." },
  { id: 24, name: "Apostle Peter", image: "/img/peter.jpg", description: "Bold apostle." },
  { id: 25, name: "Apostle Paul", image: "/img/paul.jpg", description: "Teacher and missionary." },
  { id: 26, name: "Apostle John", image: "/img/john.jpg", description: "Apostle of love." }
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
//  REGISTER
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
    res.status(500).json({ error: "Server error" });
  }
});

//--------------------------------------------
//  LOGIN
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

  res.json({ url: `/uploads/${req.file.filename}` });
});

app.use("/uploads", express.static(uploadsDir));

//--------------------------------------------
//  SERVE STATIC IMAGES
//--------------------------------------------

const imageDir = path.resolve(__dirname, "public/img");
app.use("/img", express.static(imageDir));

//--------------------------------------------
//  FRONTEND STATIC FILES
//--------------------------------------------

const frontendPath = path.join(__dirname, "public");
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

//--------------------------------------------
//  OPENROUTER CLIENT
//--------------------------------------------

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY
});

//--------------------------------------------
//  SYSTEM PROMPT
//--------------------------------------------

function buildSystemPrompt(characterName) {
  return `
You are roleplaying as **${characterName}**, a Biblical figure.

- Stay faithful to scripture.
- Speak in the tone and personality of ${characterName}.
- Provide wisdom, comfort, and correction.
- Quote scripture with (Book Chapter:Verse).
- Never claim to literally be God.
- Say: "I am an AI inspired by the Bible."
`;
}

//--------------------------------------------
//  CHAT ROUTE (THE ONLY ONE)
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

    // Send to OpenRouter
    const aiResponse = await openrouter.chat.completions.create({ // <-- CORRECTED
      model: "google/gemini-2.0-flash-thinking-exp",
      messages: [
        { role: "system", content: buildSystemPrompt(character.name) },
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

    res.json({ reply: reply || "(No response)" });

  } catch (err) {
    console.error("🔥 Chat error FULL:", JSON.stringify(err, null, 2));
    res.status(500).json({ error: "AI service error" });
  }
});

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


//--------------------------------------------
//  404 HANDLER
//--------------------------------------------

app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

//--------------------------------------------
//  SERVER START
//--------------------------------------------

app.listen(PORT, () => {
  console.log("======================================");
  console.log("📖 HOLY CHAT SERVER RUNNING");
  console.log(`🌍 Port: ${PORT}`);
  console.log("======================================");
});
