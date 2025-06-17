const express = require("express");
const axios = require("axios");
const RSSParser = require("rss-parser");
const NodeCache = require("node-cache");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
const PORT = 5000; // porta customizável
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutos
const parser = new RSSParser();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        fontSrc: ["'self'", "https:", "data:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      },
    },
  })
);

app.use(cors());

// --- API externa (GNews) ---
async function fetchFromGNews(category = "general") {
  const apiKey = "SUA_API_KEY_AQUI"; // substitua pela sua chave da GNews
  const url = `https://gnews.io/api/v4/top-headlines?lang=pt&topic=${category}&apikey=6030882339532b64dbf5851d6af73ec0`;
  const response = await axios.get(url);
  return response.data.articles.map(article => ({
    title: article.title,
    content: article.description,
    link: article.url,
  }));
}

// --- RSS ---
async function fetchFromRSS(url) {
  const feed = await parser.parseURL(url);
  return feed.items.map(item => ({
    title: item.title,
    content: item.contentSnippet,
    link: item.link,
  }));
}

// --- Rota principal ---
app.get("/news", async (req, res) => {
  const category = req.query.category || "general";

  const cached = cache.get(category);
  if (cached) return res.json(cached);

  try {
    const rssNews = await fetchFromRSS("https://g1.globo.com/rss/g1/");
    const gnewsNews = await fetchFromGNews(category);

    const allNews = [...rssNews, ...gnewsNews].slice(0, 20);
    cache.set(category, allNews);
    res.json(allNews);
  } catch (err) {
    console.error("❌ Erro ao buscar notícias:", err.message);
    res.status(500).json({ error: "Erro ao buscar notícias" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ API rodando em http://localhost:${PORT}/news`);
});
