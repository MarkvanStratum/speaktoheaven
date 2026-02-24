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
import Stripe from "stripe";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import fs from "fs";
import multer from "multer";


//--------------------------------------------
//	BASIC SETUP
//--------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || "supersecret";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

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
//	DATABASE
//--------------------------------------------

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost") 
       ? false 
       : { rejectUnauthorized: false }
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

function (req, res, next) {
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

// NEW: Custom Payment Intent Endpoint
app.post("/api/create-payment-intent", , async (req, res) => {
    try {
        const { plan } = req.body;
        const email = req.user.email; 
        
        const amounts = {
            'god': 2995,      // $29.95
            'all': 3595,      // $35.95
            'lifetime': 4995  // $49.95
        };

        if (!amounts[plan]) return res.status(400).json({ error: "Invalid plan selected" });

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amounts[plan],
            currency: "usd",
            automatic_payment_methods: { enabled: true },
            metadata: { 
                plan: plan, 
                email: email,
                userId: String(req.user.id)
            }
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e) {
        console.error("Stripe Intent Error:", e);
        res.status(500).json({ error: e.message });
    }
});

//--------------------------------------------
// STRIPE CHECKOUT (ONE-TIME PAYMENTS)
//--------------------------------------------

app.post("/api/create-checkout", , async (req, res) => {
	try {
		const { plan } = req.body;

		let amount;
		let name;

		if (plan === "god") {
			amount = 2995;
			name = "God Access (30 days)";
		} else if (plan === "all") {
			amount = 3595;
			name = "Full Access (30 days)";
		} else if (plan === "lifetime") {
			amount = 4995;
			name = "Lifetime Access";
		} else {
			return res.status(400).json({ error: "Invalid plan" });
		}

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ["card"],
			mode: "payment",
			customer_email: req.user.email,
			line_items: [
				{
					price_data: {
						currency: "usd",
						product_data: { name },
						unit_amount: amount
					},
					quantity: 1
				}
			],
			metadata: { plan },
			success_url: "https://your-site.com/success",
			cancel_url: "https://your-site.com/cancel"
		});

		res.json({ url: session.url });
	} catch (err) {
		console.error("Checkout error:", err);
		res.status(500).json({ error: "Stripe error" });
	}
});

//--------------------------------------------
//	LANDING PAGE DYNAMIC PAYMENT INTENTS
//--------------------------------------------

// 1. ENDPOINT FOR $49.95 (LIFETIME)
app.post("/api/pay/49-95", async (req, res) => {
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: 4995, // $49.95
            currency: "usd",
            automatic_payment_methods: { enabled: true },
            metadata: { 
                plan: "lifetime", 
                userId: (req.user && req.user.id) ? String(req.user.id) : null,
                email: req.body.email || (req.user ? req.user.email : null)
            }
        });
        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. ENDPOINT FOR $35.95 (ALL ACCESS)
app.post("/api/pay/35-95", , async (req, res) => {
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: 3595, // $35.95
            currency: "usd",
            automatic_payment_methods: { enabled: true },
           metadata: { 
    plan: "all", 
    userId: (req.user && req.user.id) ? String(req.user.id) : null,
    email: req.body.email || (req.user ? req.user.email : null)
}
        });
        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. ENDPOINT FOR $25.95 (GOD ONLY)
app.post("/api/pay/25-95", , async (req, res) => {
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: 2595, // $25.95
            currency: "usd",
            automatic_payment_methods: { enabled: true },
            metadata: { 
    plan: "god", 
    userId: (req.user && req.user.id) ? String(req.user.id) : null,
    email: req.body.email || (req.user ? req.user.email : null)
}
        });
        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e) {
        res.status(500).json({ error: e.message });
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

app.post("/api/upload", , upload.single("file"), (req, res) => {
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
//	FRONTEND STATIC FILES
//--------------------------------------------

const frontendPath = path.join(__dirname, "public");
if (fs.existsSync(frontendPath)) {
	app.use(express.static(frontendPath));
}

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

app.post("/api/chat", , async (req, res) => {
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

		const isPaid = userData.lifetime || (userData.expires_at && new Date(userData.expires_at) > new Date());

		// Only block if they are NOT paid AND their specific message counter is 3 or more.
		// When they pay, the Webhook sets messages_sent back to 0, which unlocks this.
		if (!isPaid && parseInt(userData.messages_sent) >= 3) {
			return res.status(403).json({ 
				error: "LIMIT_REACHED", 
				message: "You have used your 3 free divine consultations. Please choose an offering to continue." 
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

app.get("/api/messages/:characterId", , async (req, res) => {
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
// STRIPE WEBHOOK
//--------------------------------------------

// UPDATED: Webhook to handle PaymentIntents and Plan persistence
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error("Webhook Signature Error:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    async function applyPlan(plan, userId, email) {
        let expiresAt = null;
        let isLifetime = false;

        if (plan === "god" || plan === "all") {
            const date = new Date();
            date.setDate(date.getDate() + 30);
            expiresAt = date;
        } else if (plan === "lifetime") {
            isLifetime = true;
        } else {
            console.error("Unknown plan:", plan);
            return;
        }

        try {
            if (userId) {
                await pool.query(
                    `UPDATE users 
                     SET plan = $1, 
                         expires_at = $2, 
                         lifetime = $3, 
                         messages_sent = 0 
                     WHERE id = $4`,
                    [plan, expiresAt, isLifetime, Number(userId)]
                );
                console.log(`✅ User id=${userId} updated to ${plan}`);
            } else if (email) {
                await pool.query(
                    `UPDATE users 
                     SET plan = $1, 
                         expires_at = $2, 
                         lifetime = $3, 
                         messages_sent = 0 
                     WHERE email = $4`,
                    [plan, expiresAt, isLifetime, email]
                );
                console.log(`✅ User email=${email} updated to ${plan}`);
            } else {
                console.error("No userId or email provided to applyPlan()");
            }
        } catch (dbErr) {
            console.error("DB Update Error during webhook:", dbErr);
        }
    }

    // PaymentIntent flow (THIS is what checkout.html uses)
    if (event.type === "payment_intent.succeeded") {
        const paymentIntent = event.data.object;
        const plan = paymentIntent.metadata && paymentIntent.metadata.plan;
        const email = paymentIntent.metadata && paymentIntent.metadata.email;
        const userId = paymentIntent.metadata && paymentIntent.metadata.userId;

        console.log("🔥 payment_intent.succeeded", { plan, email, userId });

        await applyPlan(plan, userId, email);
    }

    // Checkout flow (if you ever use /api/create-checkout)
    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const plan = session.metadata && session.metadata.plan;
        const email =
            (session.metadata && session.metadata.email) ||
            (session.customer_details && session.customer_details.email);
        const userId = session.metadata && session.metadata.userId;

        console.log("🔥 checkout.session.completed", { plan, email, userId });

        await applyPlan(plan, userId, email);
    }

    res.json({ received: true });
});

app.get("/", (req, res) => {
	const indexPath = path.join(__dirname, "public", "index.html");
	if (fs.existsSync(indexPath)) {
		return res.sendFile(indexPath);
	}
	res.status(200).send("Server is running, but public/index.html is missing.");
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