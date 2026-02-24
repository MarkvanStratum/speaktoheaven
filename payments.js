import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const handleCreateIntent = async (req, res) => {
    try {
        const { plan, email } = req.body;

        // Validation: We MUST have an email for guest checkout
        if (!email) {
            return res.status(400).json({ error: "Email is required for checkout." });
        }

        const amounts = {
            'god': 2995,
            'all': 3595,
            'lifetime': 4995
        };

        const amount = amounts[plan] || 4995;

        // Create the Stripe Intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency: "usd",
            metadata: { 
                plan: plan, 
                email: email.toLowerCase().trim(),
                isGuest: "true" // A flag to tell our webhook this came from a landing page
            },
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e) {
        console.error("Payment Error:", e.message);
        res.status(500).json({ error: e.message });
    }
};