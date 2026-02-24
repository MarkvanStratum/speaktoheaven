//--------------------------------------------
//	SERVER.JS — BIBLICAL AI CHAT EDITION
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || "supersecret";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

app.use(cors());

// Stripe webhook must use express.raw
app.use((req, res, next) => {
    if (req.originalUrl === "/webhook") {
        express.raw({ type: "application/json" })(req, res, next);
    } else {
        express.json()(req, res, next);
    }
});

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost") 
       ? false 
       : { rejectUnauthorized: false }
});

//--------------------------------------------
//	AUTH MIDDLEWARE
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
//	PAYMENT INTENT (GUEST & MEMBER)
//--------------------------------------------
app.post("/api/create-payment-intent", async (req, res) => {
    try {
        const { plan, email: guestEmail } = req.body;

        // Try to identify user if a token is present, otherwise use the form email
        let email = guestEmail;
        let userId = null;

        const authHeader = req.headers["authorization"];
        if (authHeader) {
            const token = authHeader.split(" ")[1];
            try {
                const decoded = jwt.verify(token, SECRET_KEY);
                userId = decoded.id;
                email = decoded.email;
            } catch (err) { /* ignore invalid token for guest checkout */ }
        }

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        const amounts = { 'god': 2995, 'all': 3595, 'lifetime': 4995 };
        const amount = amounts[plan] || 4995;

        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency: "usd",
            metadata: { 
                plan, 
                email: email.toLowerCase().trim(),
                userId 
            },
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

//--------------------------------------------
//	STRIPE WEBHOOK (WITH AUTO-ACCOUNT CREATION)
//--------------------------------------------
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "payment_intent.succeeded" || event.type === "checkout.session.completed") {
        const data = event.data.object;
        const plan = data.metadata?.plan;
        const email = (data.metadata?.email || data.customer_details?.email)?.toLowerCase().trim();
        const userId = data.metadata?.userId;

        let expiresAt = null;
        let isLifetime = (plan === "lifetime");

        if (plan === "god" || plan === "all") {
            const date = new Date();
            date.setDate(date.getDate() + 30);
            expiresAt = date;
        }

        try {
            // Check if user exists
            const userCheck = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
            
            if (userCheck.rows.length > 0) {
                // UPDATE EXISTING USER
                await pool.query(
                    `UPDATE users SET plan = $1, expires_at = $2, lifetime = $3, messages_sent = 0 WHERE email = $4`,
                    [plan, expiresAt, isLifetime, email]
                );
                console.log(`✅ Existing user ${email} upgraded to ${plan}`);
            } else {
                // CREATE NEW GUEST USER
                const tempPassword = crypto.randomBytes(8).toString('hex');
                const hashed = await bcrypt.hash(tempPassword, 10);
                
                await pool.query(
                    `INSERT INTO users (email, password, plan, expires_at, lifetime, messages_sent) 
                     VALUES ($1, $2, $3, $4, $5, 0)`,
                    [email, hashed, plan, expiresAt, isLifetime]
                );
                console.log(`✅ Guest account created for ${email} with plan ${plan}`);
                // Note: You should trigger a "Welcome/Reset Password" email here
            }
        } catch (dbErr) {
            console.error("❌ Webhook DB Error:", dbErr);
        }
    }

    res.json({ received: true });
});

// ... (Rest of your original routes: /api/login, /api/chat, etc. remain the same)
app.listen(PORT, () => console.log(`🌍 Server running on port ${PORT}`));