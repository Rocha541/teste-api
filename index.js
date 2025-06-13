const express = require("express");
const axios = require("axios");
const RSSParser = require("rss-parser");
const NodeCache = require("node-cache");
const cors = require("cors");

const app = express();
const PORT = 5000; // porta personalizada
const cache = new NodeCache({ stdTTL: 300 }); // cache de 5 minutos
const parser = new RSSParser();

const helmet = require("helmet");

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

// --- Função para buscar dados de API externa ---
async function fetchFromGNews() {
  const apiKey = "SUA_API_KEY_AQUI";
  const url = `https://gnews.io/api/v4/top-headlines?lang=pt&apikey=${apiKey}`;
  const response = await axios.get(url);
  return response.data.articles;
}

// --- Função para buscar RSS ---
async function fetchFromRSS(url) {
  const feed = await parser.parseURL(url);
  return feed.items.map(item => ({
    title: item.title,
    content: item.contentSnippet,
    link: item.link,
  }));
}

// --- Endpoint principal ---
app.get("/news", async (req, res) => {
  const category = req.query.category || "general";

  // Verifica se tem cache
  const cached = cache.get(category);
  if (cached) {
    return res.json(cached);
  }

  try {
    const rssNews = await fetchFromRSS("https://rss.uol.com.br/feed/noticias.xml");
    const gnewsNews = await fetchFromGNews();

    const allNews = [...rssNews, ...gnewsNews].slice(0, 10); // limitar resultados
    cache.set(category, allNews); // salvar no cache
    res.json(allNews);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar notícias" });
  }
});

app.listen(PORT, () => {
  console.log(`API de notícias rodando em http://localhost:${PORT}`);
});
