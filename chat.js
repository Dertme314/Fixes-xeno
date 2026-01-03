// api/chat.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fullConversation = req.body.messages;

  if (!Array.isArray(fullConversation)) {
    return res.status(400).json({ error: "Invalid message format." });
  }

  // 1. Create a list of keys to try in order
  const apiKeys = [
    process.env.API_KEY,   // Primary
    process.env.API_KEY_2, // Backup 1
    process.env.API_KEY_3  // Backup 2 (Optional, add as many as you want)
  ].filter(Boolean); // This removes any keys that are missing/undefined

  if (apiKeys.length === 0) {
    return res.status(500).json({
      error: "API keys missing.",
      details: "Add API_KEY and API_KEY_2 in Vercel > Environment Variables."
    });
  }

  let lastError = null;
  let lastStatus = 500;

  // 2. Loop through the keys
  for (const currentKey of apiKeys) {
    try {
      // console.log(`Attempting with key ending in ...${currentKey.slice(-4)}`);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${currentKey}`,
          "Content-Type": "application/json",
          "Referer": "https://xeno.onl",
          "X-Title": "Xeno Help RAG"
        },
        body: JSON.stringify({
          model: "tngtech/deepseek-r1t2-chimera:free",
          messages: fullConversation,
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      const data = await response.json();

      // IF SUCCESS: Return immediately and stop the function
      if (response.ok) {
        return res.status(200).json({
          choices: data.choices
        });
      }

      // IF FAILURE: Log it, save error, and continue loop to next key
      console.warn(`Key ending in ...${currentKey.slice(-4)} failed: ${response.status}`);
      lastStatus = response.status;
      lastError = data.error || "External API Error";
      
      // The loop will now restart with the next key in the list...

    } catch (err) {
      console.error("Network Error with key:", err);
      lastError = err.message;
    }
  }

  // 3. If we finish the loop and NOTHING worked
  return res.status(lastStatus).json({
    error: "All API keys failed.",
    details: lastError
  });
}
