//--------------------------------------------
//  SERVER.JS — BIBLICAL AI CHAT EDITION (FIXED)
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
//  AUTH ENDPOINTS (unchanged)
//--------------------------------------------
// (Keeping them identical—no changes needed)
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
//  SERVE STATIC IMAGES — FIXED VERSION
//--------------------------------------------

const imageDir = path.resolve(__dirname, "public/img");
console.log("📸 Image folder:", imageDir);

app.use("/img", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});

app.use("/img", express.static(imageDir, {
  fallthrough: false,
  index: false
}));

app.use("/img", (req, res) => {
  console.log("❌ IMAGE NOT FOUND:", req.originalUrl);
  res.status(404).send("Image not found");
});

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
