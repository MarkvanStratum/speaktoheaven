// ================================
//              IMPORTS (ESM)
// ================================
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import stripeLib from "stripe";
import { OpenAI } from "openai";

import supabase from "./utils/supabase.js";
import { addAiMessageDrip } from "./utils/aiDrip.js";
import { appendAiOutput, buildLogs } from "./utils/logs.js";

// ================================
//            INIT
// ================================
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const stripe = stripeLib(process.env.STRIPE_SECRET_KEY);

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// ================================
//   BIBLICAL SYSTEM PROMPT BUILDER
// ================================
function buildBiblicalSystemPrompt(name) {
  return `
You are an AI representation inspired by the biblical figure: ${name}.
You are NOT the real ${name}, nor a deity. You are an AI roleplay assistant.
If asked, you must clearly acknowledge that you are an AI representation.

Speak in the tone and style associated with this biblical figure.
Use the entire Bible as stylistic reference, and cite scripture when appropriate.
Do NOT claim divine authority or prophetic power.
Do NOT issue supernatural commands.
  `;
}

// ================================
//      AUTH HELPERS
// ================================
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET || "TEMP_SECRET",
    { expiresIn: "30d" }
  );
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET || "TEMP_SECRET", (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
}

// ================================
//        SIGNUP / LOGIN
// ================================
app.post("/api/signup", async (req, res) => {
  const { email, password } = req.body;

  const { data: exists } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (exists) return res.status(409).json({ error: "Email already registered" });

  const hash = await bcrypt.hash(password, 10);

  const { data: user, error } = await supabase
    .from("users")
    .insert([{ email, password_hash: hash, credits: 10 }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: "Signup failed" });

  res.json({ token: generateToken(user) });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (!user) return res.status(404).json({ error: "User not found" });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Incorrect password" });

  res.json({ token: generateToken(user) });
});

// ================================
//           USER INFO
// ================================
app.get("/api/me", authenticateToken, async (req, res) => {
  const { data: user } = await supabase
    .from("users")
    .select("id, email, credits, is_operator, stripe_customer_id")
    .eq("id", req.user.id)
    .single();

  res.json(user);
});

// ================================
//         STRIPE CHECKOUT
// ================================
app.post("/api/create-checkout-session", authenticateToken, async (req, res) => {
  const { priceId } = req.body;

  // get user stripe id
  const { data: user } = await supabase
    .from("users")
    .select("stripe_customer_id")
    .eq("id", req.user.id)
    .single();

  let customerId = user.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: req.user.email,
      metadata: { userId: req.user.id },
    });
    customerId = customer.id;

    await supabase
      .from("users")
      .update({ stripe_customer_id: customerId })
      .eq("id", req.user.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: "https://aiangelica.com/bible?success=1",
    cancel_url: "https://aiangelica.com/bible?canceled=1",
  });

  res.json({ url: session.url });
});

// ================================
//        STRIPE WEBHOOK
// ================================
app.post(
  "/api/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (e) {
      return res.status(400).send(`Webhook error: ${e.message}`);
    }

    if (event.type === "invoice.payment_succeeded") {
      const customerId = event.data.object.customer;

      await supabase
        .from("users")
        .update({ credits: 9999 })
        .eq("stripe_customer_id", customerId);
    }

    res.json({ received: true });
  }
);

// ================================
//       MAIN AI CHAT ROUTE
// ================================
app.post("/api/chat", authenticateToken, async (req, res) => {
  const { message, girlId, chatId } = req.body;

  // user
  const { data: user } = await supabase
    .from("users")
    .select("id, credits")
    .eq("id", req.user.id)
    .single();

  if (user.credits <= 0)
    return res.status(402).json({ error: "Out of credits" });

  await supabase
    .from("users")
    .update({ credits: user.credits - 1 })
    .eq("id", user.id);

  // profile
  const { data: profile } = await supabase
    .from("girls")
    .select("*")
    .eq("id", girlId)
    .single();

  // history
  const { data: pastMessages } = await supabase
    .from("ai_messages")
    .select("text, ai")
    .eq("chat_id", chatId)
    .order("id", { ascending: true });

  const history = pastMessages
    ? pastMessages.map((m) => ({
        role: m.ai ? "assistant" : "user",
        content: m.text,
      }))
    : [];

  const messages = [
    { role: "system", content: buildBiblicalSystemPrompt(profile.name) },
    ...history,
    { role: "user", content: message },
  ];

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: "openai/gpt-4.1-mini",
      messages,
      temperature: 0.9,
      max_tokens: 250,
    });
  } catch (err) {
    console.error("OpenRouter error:", err);
    return res.status(500).json({ error: "AI request failed" });
  }

  const aiText = completion.choices?.[0]?.message?.content || "(no response)";

  // store
  await supabase.from("ai_messages").insert([
    { chat_id: chatId, text: message, ai: false },
    { chat_id: chatId, text: aiText, ai: true },
  ]);

  addAiMessageDrip(chatId, aiText);

  res.json({ response: aiText, logs: buildLogs(messages, aiText) });
});

// ================================
//        CHATS + MESSAGES
// ================================
app.post("/api/create-chat", authenticateToken, async (req, res) => {
  const { girlId } = req.body;

  const { data: chat } = await supabase
    .from("chats")
    .insert([{ girl_id: girlId, user_id: req.user.id }])
    .select()
    .single();

  res.json(chat);
});

app.get("/api/chats", authenticateToken, async (req, res) => {
  const { data: chats } = await supabase
    .from("chats")
    .select("id, girl_id")
    .eq("user_id", req.user.id);

  res.json(chats);
});

app.get("/api/messages/:chatId", authenticateToken, async (req, res) => {
  const { chatId } = req.params;

  const { data: messages } = await supabase
    .from("ai_messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("id", { ascending: true });

  res.json(messages);
});

// ================================
//        OPERATOR MODE
// ================================
app.get("/api/operator/customers", authenticateToken, async (req, res) => {
  const { data: me } = await supabase
    .from("users")
    .select("is_operator")
    .eq("id", req.user.id)
    .single();

  if (!me?.is_operator)
    return res.status(403).json({ error: "Forbidden" });

  const { data: customers } = await supabase
    .from("users")
    .select("id, email, credits");

  res.json(customers);
});

// ================================
//           START SERVER
// ================================
app.listen(PORT, () =>
  console.log(`Bible AI server running (ESM) on port ${PORT}`)
);
