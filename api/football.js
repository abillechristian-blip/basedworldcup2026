export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  const { endpoint } = req.query;
  if (!endpoint) return res.status(400).json({ error: "Missing endpoint parameter" });
  const API_KEY = "4dcd408df3dd4a8bbc912c3e957bb7bd";
  const BASE_URL = "https://api.football-data.org/v4";
  try {
    const response = await fetch(`${BASE_URL}/${endpoint}`, {
      headers: { "X-Auth-Token": API_KEY, "Content-Type": "application/json" },
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
