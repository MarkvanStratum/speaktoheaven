import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const handleCreateIntent = async (req, res) => {
    try {
        // We grab paymentMethodId and email just like your working server
        const { email, plan } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        // Map the plan names to the prices
        const amounts = { '2995': 2995, '3595': 3595, '4995': 4995 };
        const amount = amounts[plan] || 4995;

        // This is the EXACT logic from your working server file
        const paymentIntent = await stripe.paymentIntents.create({
    amount: amount,
    currency: "usd",
    metadata: { 
        plan: plan, 
        email: email.toLowerCase().trim() 
    },
});

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (err) {
        console.error("❌ Stripe Error:", err.message);
        res.status(500).json({ error: err.message });
    }
};