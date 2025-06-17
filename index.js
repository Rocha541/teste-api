const express = require("express");
const axios = require("axios");
const RSSParser = require("rss-parser");
const NodeCache = require("node-cache");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
const PORT = 5000;
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 }); // Cache de 10 min e checagem a cada 2 min
const parser = new RSSParser({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
    ],
  },
});

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
  return response.data.articles.map((article) => ({
    title: article.title,
    content: article.description,
    link: article.url,
    image: article.image || null,
    source: article.source.name || null,
  }));
}

// --- RSS (G1) ---
async function fetchFromRSS(url) {
  const feed = await parser.parseURL(url);
  return feed.items.map((item) => {
    // Tentativa de extrair a imagem:
    let image = null;

    // 1) Tenta media:content
    if (item.mediaContent && item.mediaContent.length > 0 && item.mediaContent[0].$.url) {
      image = item.mediaContent[0].$.url;
    }
    // 2) Tenta media:thumbnail
    else if (item.mediaThumbnail && item.mediaThumbnail.length > 0 && item.mediaThumbnail[0].$.url) {
      image = item.mediaThumbnail[0].$.url;
    }
    // 3) Tenta extrair imagem do conteúdo HTML (content ou contentSnippet)
    else if (item.content) {
      const imgMatch = item.content.match(/<img.*?src="(.*?)"/);
      if (imgMatch && imgMatch[1]) image = imgMatch[1];
    }

    return {
      title: item.title,
      content: item.contentSnippet || item.content || "",
      link: item.link,
      image,
      source: feed.title || "G1",
    };
  });
}

// --- Rota principal ---
app.get("/news", async (req, res) => {
  const category = req.query.category || "general";

  // Cache por categoria
  const cached = cache.get(category);
  if (cached) return res.json(cached);

  try {
    const rssUrl = "https://g1.globo.com/rss/g1/";
    const rssNews = await fetchFromRSS(rssUrl);
    const gnewsNews = await fetchFromGNews(category);

    // Une e limita a 20 itens
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
