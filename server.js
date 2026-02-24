//--------------------------------------------
//	SERVER.JS — REWRITTEN MASTER VERSION
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
import fs from "fs";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || "supersecret";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

app.use(cors());

// Custom parser for Webhooks vs JSON
app.use((req, res, next) => {
    if (req.originalUrl === "/webhook") {
        express.raw({ type: "application/json" })(req, res, next);
    } else {
        express.json()(req, res, next);
    }
});

//--------------------------------------------
//	DATABASE SETUP
//--------------------------------------------
const { Pool } = pkg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false }
});

//--------------------------------------------
//	MIDDLEWARE (AUTHENTICATION)
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

// Optional Auth: Used for guest payments so it doesn't block "Unauthorized"
function optionalAuth(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader?.split(" ")[1];
    if (!token) {
        req.user = null;
        return next();
    }
    jwt.verify(token, SECRET_KEY, (err, user) => {
        req.user = err ? null : user;
        next();
    });
}

//--------------------------------------------
//	NEW LANDING PAGE ENDPOINTS (GUEST ACCESSIBLE)
//--------------------------------------------

// 1. LIFETIME ($49.95)
app.post("/api/pay/49-95", optionalAuth, async (req, res) => {
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: 4995,
            currency: "usd",
            automatic_payment_methods: { enabled: true },
            metadata: { 
                plan: "lifetime", 
                userId: req.user ? String(req.user.id) : "",
                email: req.body.email || (req.user ? req.user.email : "")
            }
        });
        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. ALL ACCESS ($35.95)
app.post("/api/pay/35-95", optionalAuth, async (req, res) => {
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: 3595,
            currency: "usd",
            automatic_payment_methods: { enabled: true },
            metadata: { 
                plan: "all", 
                userId: req.user ? String(req.user.id) : "",
                email: req.body.email || (req.user ? req.user.email : "")
            }
        });
        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. GOD ONLY ($25.95)
app.post("/api/pay/25-95", optionalAuth, async (req, res) => {
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: 2595,
            currency: "usd",
            automatic_payment_methods: { enabled: true },
            metadata: { 
                plan: "god", 
                userId: req.user ? String(req.user.id) : "",
                email: req.body.email || (req.user ? req.user.email : "")
            }
        });
        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

//--------------------------------------------
//	WEBSITE INTERNAL CHECKOUT (STAYS THE SAME)
//--------------------------------------------
app.post("/api/create-checkout", authenticateToken, async (req, res) => {
    try {
        const { plan } = req.body;
        let amount = (plan === "lifetime") ? 4995 : (plan === "all") ? 3595 : 2995;
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "payment",
            customer_email: req.user.email,
            line_items: [{
                price_data: { currency: "usd", product_data: { name: plan }, unit_amount: amount },
                quantity: 1
            }],
            metadata: { plan, userId: String(req.user.id) },
            success_url: "https://your-site.com/success",
            cancel_url: "https://your-site.com/cancel"
        });
        res.json({ url: session.url });
    } catch (err) { res.status(500).json({ error: "Stripe error" }); }
});

//--------------------------------------------
//	STRIPE WEBHOOK (MASTER HANDLER)
//--------------------------------------------
app.post("/webhook", async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) { return res.status(400).send(`Webhook Error: ${err.message}`); }

    const applyPlan = async (plan, userId, email) => {
        let expiresAt = null;
        let isLifetime = (plan === "lifetime");
        if (!isLifetime) {
            const date = new Date();
            date.setDate(date.getDate() + 30);
            expiresAt = date;
        }

        const query = userId 
            ? ["UPDATE users SET plan=$1, expires_at=$2, lifetime=$3, messages_sent=0 WHERE id=$4", [plan, expiresAt, isLifetime, userId]]
            : ["UPDATE users SET plan=$1, expires_at=$2, lifetime=$3, messages_sent=0 WHERE email=$4", [plan, expiresAt, isLifetime, email]];

        await pool.query(query[0], query[1]);
    };

    if (event.type === "payment_intent.succeeded" || event.type === "checkout.session.completed") {
        const data = event.data.object;
        const plan = data.metadata?.plan;
        const email = data.metadata?.email || data.customer_details?.email;
        const userId = data.metadata?.userId;
        await applyPlan(plan, userId, email);
    }
    res.json({ received: true });
});

// Keep your Auth (Register/Login), Chat, and OpenAI routes below this...
// [The rest of your existing profile/auth logic should be pasted here]

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));