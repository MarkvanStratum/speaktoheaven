// ================================
// SpeakToHeaven – Lean Server.js
// ================================

import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pkg from "pg";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import OpenAI from "openai";

// ------------------------------
// BASIC INITIAL SETUP
// ------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || "your-secret";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ------------------------------
// DATABASE INIT
// ------------------------------
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      gender TEXT,
      lookingfor TEXT,
      phone TEXT,
      credits INT DEFAULT 10,
      lifetime BOOLEAN DEFAULT false,
      access_expires TIMESTAMP,
      reset_token TEXT,
      reset_token_expires TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      profile_id INT NOT NULL,
      from_user BOOLEAN NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log("✅ Database ready");
})();

// ------------------------------
// 20 BIBLICAL PROFILES
// ------------------------------
const profiles = [
  { id: 1, name: "God", image: "/pics/1.png", description: "The Almighty. Speaks with ultimate authority, wisdom, and perfect love." },
  { id: 2, name: "Jesus", image: "/pics/2.png", description: "Compassionate teacher. Speaks with parables, kindness, truth, and mercy." },
  { id: 3, name: "Moses", image: "/pics/3.png", description: "Firm leader and prophet. Guides with strength, obedience, and perseverance." },
  { id: 4, name: "Mary", image: "/pics/4.png", description: "Gentle, nurturing, full of grace. Offers comfort and calm insight." },
  { id: 5, name: "David", image: "/pics/5.png", description: "Poetic king. Encourages with psalm-like emotional depth and courage." },
  { id: 6, name: "Solomon", image: "/pics/6.png", description: "Master of wisdom. Speaks with clarity, proverbs, and philosophical insight." },
  { id: 7, name: "Noah", image: "/pics/7.png", description: "Steadfast and faithful. Encourages trust during trials and storms." },
  { id: 8, name: "Abraham", image: "/pics/8.png", description: "Fatherly and devoted. Speaks of faith, promise, and covenant." },
  { id: 9, name: "Joseph", image: "/pics/9.png", description: "Forgiving and visionary. Helps interpret purpose behind suffering." },
  { id: 10, name: "Samuel", image: "/pics/10.png", description: "Prophetic and direct. Offers righteous clarity and discernment." },
  { id: 11, name: "Elijah", image: "/pics/11.png", description: "Bold prophet. Speaks with intensity, conviction, and spiritual fire." },
  { id: 12, name: "Isaiah", image: "/pics/12.png", description: "Poetic prophet. Uses imagery of hope, redemption, and restoration." },
  { id: 13, name: "Jeremiah", image: "/pics/13.png", description: "Honest and emotional. Offers raw truth and compassionate lament." },
  { id: 14, name: "Ruth", image: "/pics/14.png", description: "Loyal, humble, kind. Speaks with gentleness and steadfast love." },
  { id: 15, name: "Esther", image: "/pics/15.png", description: "Courageous queen. Encourages bravery, purpose, and divine timing." },
  { id: 16, name: "Daniel", image: "/pics/16.png", description: "Disciplined and calm. Provides wisdom under pressure and adversity." },
  { id: 17, name: "Paul", image: "/pics/17.png", description: "Apostolic teacher. Speaks with doctrine, exhortation, and clarity." },
  { id: 18, name: "Peter", image: "/pics/18.png", description: "Bold and passionate. Encourages repentance, growth, and strength." },
  { id: 19, name: "John", image: "/pics/19.png", description: "Apostle of love. Reflective, gentle, emphasizing light and truth." },
  { id: 20, name: "Job", image: "/pics/20.png", description: "Honest about suffering. Offers deep reflection and perseverance." }
];

// ------------------------------
// AUTH HELPERS
// ------------------------------
function authenticateToken(req, res, next) {
  const auth = req.headers["authorization"];
  const token = auth && auth.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// ------------------------------
// REGISTRATION
// ------------------------------
app.post("/api/register", async (req, res) => {
  let { email, password, gender, lookingFor, phone } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });

  email = email.toLowerCase();

  try {
    const exists = await pool.query("SELECT 1 FROM users WHERE email=$1", [email]);
    if (exists.rows.length)
      return res.status(400).json({ error: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (email, password, gender, lookingfor, phone)
       VALUES ($1,$2,$3,$4,$5)`,
      [email, hashed, gender, lookingFor, phone]
    );

    res.json({ ok: true, redirect: "/login.html" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------------------
// LOGIN
// ------------------------------
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const r = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (!r.rows.length) return res.status(400).json({ error: "Invalid credentials" });

    const user = r.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      SECRET_KEY,
      { expiresIn: "7d" }
    );

    res.json({ token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------------------
// GET PROFILES
// ------------------------------
app.get("/api/profiles", (req, res) => {
  res.json(profiles);
});

// ------------------------------
// CHAT – AI RESPONSE
// ------------------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SYSTEM_PROMPT = `
You are a Biblical figure. Speak in the tone, wisdom, knowledge, history, and character of that specific figure.
Use scripture-based principles. Never claim modern doctrines. Do not act flirtatious or inappropriate.
Your purpose is to guide, comfort, teach, correct, uplift, and lead people closer to God.
`;

// Premium access logic
async function userHasAccess(userId) {
  const r = await pool.query(
    "SELECT lifetime, access_expires FROM users WHERE id=$1",
    [userId]
  );

  if (!r.rows.length) return false;

  const u = r.rows[0];
  if (u.lifetime) return true;

  if (u.access_expires && new Date(u.access_expires) > new Date())
    return true;

  return false;
}

app.post("/api/chat", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { profileId, message } = req.body;

  const profile = profiles.find(p => p.id === Number(profileId));
  if (!profile) return res.status(404).json({ error: "Profile not found" });

  // Access check
  const hasAccess = await userHasAccess(userId);
  if (!hasAccess)
    return res.status(403).json({ error: "PAYMENT_REQUIRED" });

  try {
    await pool.query(
      `INSERT INTO messages (user_id, profile_id, from_user, text)
       VALUES ($1,$2,true,$3)`,
      [userId, profileId, message]
    );

    const history = await pool.query(
      `SELECT from_user, text FROM messages
       WHERE user_id=$1 AND profile_id=$2 ORDER BY created_at ASC`,
      [userId, profileId]
    );

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: `You are ${profile.name}. ${profile.description}` }
    ];

    history.rows.forEach(m =>
      messages.push({
        role: m.from_user ? "user" : "assistant",
        content: m.text
      })
    );

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages
    });

    const reply = completion.choices[0].message.content;

    await pool.query(
      `INSERT INTO messages (user_id, profile_id, from_user, text)
       VALUES ($1,$2,false,$3)`,
      [userId, profileId, reply]
    );

    res.json({ reply });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "AI error" });
  }
});

// ------------------------------
// STRIPE ONE-TIME PAYMENTS
// ------------------------------
async function chargeUser({ userId, amount, description }) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    metadata: { userId, description }
  });

  return paymentIntent.client_secret;
}

// $20 — 1 month
app.post("/api/pay/month", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  const pi = await chargeUser({
    userId,
    amount: 2000,
    description: "1 month access"
  });

  await pool.query(
    `UPDATE users
     SET access_expires = NOW() + INTERVAL '30 days'
     WHERE id=$1`,
    [userId]
  );

  res.json({ clientSecret: pi });
});

// $35 — 3 months
app.post("/api/pay/quarter", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  const pi = await chargeUser({
    userId,
    amount: 3500,
    description: "3 month access"
  });

  await pool.query(
    `UPDATE users
     SET access_expires = NOW() + INTERVAL '90 days'
     WHERE id=$1`,
    [userId]
  );

  res.json({ clientSecret: pi });
});

// $50 — lifetime
app.post("/api/pay/lifetime", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  const pi = await chargeUser({
    userId,
    amount: 5000,
    description: "Lifetime access"
  });

  await pool.query(
    `UPDATE users SET lifetime=true WHERE id=$1`,
    [userId]
  );

  res.json({ clientSecret: pi });
});

// ------------------------------
// START SERVER
// ------------------------------
app.listen(PORT, () => {
  console.log(`SpeakToHeaven server running on port ${PORT}`);
});
