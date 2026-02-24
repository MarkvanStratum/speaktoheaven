import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const handleCreateIntent = async (req, res) => {
    try {
        const { plan, email } = req.body || {};

        if (!email) {
            return res.status(400).json({ error: "Email is required for checkout." });
        }

        // New Plan Names matching your requested prices
        const amounts = {
            '2995': 2995, // $29.95
            '3595': 3595, // $35.95
            '4995': 4995  // $49.95
        };

        // Looks up the price based on the new names
        const amount = amounts[plan] || 4995;

        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency: "usd",
            metadata: { 
                plan: plan, 
                email: email.toLowerCase().trim(),
                isGuest: "true"
            },
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e) {
        console.error("Payment Error:", e.message);
        res.status(500).json({ error: e.message });
    }
};