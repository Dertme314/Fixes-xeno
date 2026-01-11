export default async function handler(req, res) {
    if (req.method === 'POST') {
        const { feedback, messageContent, timestamp } = req.body;
        
        console.log("--- USER FEEDBACK RECEIVED ---");
        console.log("Time:", new Date(timestamp).toISOString());
        console.log("Feedback:", feedback);
        console.log("Message Snippet:", messageContent ? messageContent.substring(0, 100) + "..." : "N/A");
        
        // --- Send to Discord Webhook (Persistent Storage) ---
        const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
        
        if (webhookUrl) {
            try {
                await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: "Derts Feedback Bot",
                        embeds: [{
                            title: "👎 New Negative Feedback",
                            color: 16734296, // Red
                            fields: [
                                { name: "User Feedback", value: feedback || "No details provided" },
                                { name: "AI Response Context", value: messageContent ? (messageContent.substring(0, 800) + (messageContent.length > 800 ? "..." : "")) : "N/A" },
                                { name: "Timestamp", value: new Date(timestamp).toLocaleString() }
                            ],
                            footer: { text: "Xeno Helper Feedback System" }
                        }]
                    })
                });
            } catch (err) {
                console.error("Failed to send to Discord:", err);
            }
        }

        return res.status(200).json({ status: 'ok' });
    }
    return res.status(405).json({ error: 'Method not allowed' });
}