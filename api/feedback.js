export default async function handler(req, res) {
    if (req.method === 'POST') {
        const { feedback, messageContent, timestamp } = req.body;
        
        console.log("--- USER FEEDBACK RECEIVED ---");
        console.log("Time:", new Date(timestamp).toISOString());
        console.log("Feedback:", feedback);
        console.log("Message Snippet:", messageContent ? messageContent.substring(0, 100) + "..." : "N/A");
        
        return res.status(200).json({ status: 'ok' });
    }
    return res.status(405).json({ error: 'Method not allowed' });
}