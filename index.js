const express = require("express");
const axios = require("axios");
const RSSParser = require("rss-parser");
const NodeCache = require("node-cache");
const cors = require("cors");
const helmet = require("helmet");
const crypto = require("crypto");

const app = express();
const PORT = 5000;
const cache = new NodeCache({ stdTTL: 300 }); // cache por 5 min
const parser = new RSSParser();

// Middleware
app.use(cors());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self"],
        fontSrc: ["'self", "https:", "data:"],
        styleSrc: ["'self", "'unsafe-inline'", "https:"],
      },
    },
  })
);

// Utilitário para ID único baseado no link
function generateId(link) {
  return crypto.createHash("md5").update(link).digest("hex");
}

function getQueryNumber(value, fallback) {
  if (Array.isArray(value)) value = value[0];
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

// 📰 RSS (ex: G1)
async function fetchFromRSS(url) {
  const feed = await parser.parseURL(url);

  function extractCategoryFromLink(link) {
    if (!link) return "general";
    const match = link.match(/g1\.globo\.com\/([^\/]+)\//);
    return match?.[1]?.toLowerCase() || "general";
  }

  return feed.items
    .map((item) => {
      let image = null;

      if (item.enclosure?.url) image = item.enclosure.url;
      else if (item.mediaContent?.[0]?.$?.url) image = item.mediaContent[0].$.url;
      else if (item.mediaThumbnail?.[0]?.$?.url) image = item.mediaThumbnail[0].$.url;
      else {
        const imgMatch = item.content?.match(/<img.*?src=\"(.*?)\"/);
        if (imgMatch?.[1]) image = imgMatch[1];
      }

      if (!image) return null;

      const description = (item.description || item.contentSnippet || "").trim();
      const shortDescription =
        description.length > 150 ? description.slice(0, 147).trim() + "..." : description;

      const category = extractCategoryFromLink(item.link);
      const link = item.link || "#";

      return {
        id: generateId(link),
        title: item.title || "Título indisponível",
        description: shortDescription,
        content: item["content:encoded"] || item.content || "Conteúdo não disponível",
        link,
        image,
        category,
        source: feed.title || "G1",
        pubDate: item.pubDate || null,
      };
    })
    .filter(Boolean);
}

// 📰 GNews
async function fetchFromGNews(category = "general") {
  const apiKey = "6030882339532b64dbf5851d6af73ec0";
  const url = `https://gnews.io/api/v4/top-headlines?lang=pt&topic=${category}&max=50&apikey=${apiKey}`;
  const response = await axios.get(url);

  return response.data.articles
    .filter((article) => article.image)
    .map((article) => {
      const link = article.url || "#";
      const description = article.description?.trim() || "Descrição não disponível";
      const shortDescription =
        description.length > 150 ? description.slice(0, 147).trim() + "..." : description;

      return {
        id: generateId(link),
        title: article.title || "Título indisponível",
        description: shortDescription,
        content: article.content || article.description || "",
        link,
        image: article.image,
        category,
        source: article.source.name || "GNews",
        pubDate: article.publishedAt || null,
      };
    });
}

// 📡 Endpoint principal
app.get("/news", async (req, res) => {
  const category = (req.query.category || "geral").toString().toLowerCase();
  const page = getQueryNumber(req.query.page, 1);
  const limit = getQueryNumber(req.query.limit, 5);
  const start = (page - 1) * limit;
  const end = start + limit;

  try {
    let allNews = cache.get(category);

    if (!allNews) {
      const rssUrl = "https://g1.globo.com/rss/g1/";
      const [rssNews, gnewsNews] = await Promise.all([
        fetchFromRSS(rssUrl),
        fetchFromGNews(category),
      ]);
      allNews = [...rssNews, ...gnewsNews];
      cache.set(category, allNews);
    }

    const paginatedNews = allNews.slice(start, end);
    const totalPages = Math.ceil(allNews.length / limit);

    res.json({
      currentPage: page,
      totalPages,
      totalItems: allNews.length,
      pageSize: limit,
      articles: paginatedNews,
    });
  } catch (err) {
    console.error("❌ Erro ao buscar notícias:", err.message);
    res.status(500).json({ error: "Erro ao buscar notícias" });
  }
});

// 🔎 Buscar uma notícia por ID
app.get("/news/:id", async (req, res) => {
  const { id } = req.params;
  const category = (req.query.category || "geral").toLowerCase();

  try {
    // Verifica cache da categoria
    let allNews = cache.get(category);

    if (!allNews) {
      // Se não tiver no cache, busca novamente
      const rssUrl = "https://g1.globo.com/rss/g1/";
      const [rssNews, gnewsNews] = await Promise.all([
        fetchFromRSS(rssUrl),
        fetchFromGNews(category),
      ]);
      allNews = [...rssNews, ...gnewsNews];
      cache.set(category, allNews);
    }

    // Busca pelo ID da notícia
    const article = allNews.find((item) => item.id === id);

    if (!article) {
      return res.status(404).json({ error: "Notícia não encontrada" });
    }

    res.json(article);
  } catch (err) {
    console.error("❌ Erro ao buscar notícia por ID:", err.message);
    res.status(500).json({ error: "Erro ao buscar notícia por ID" });
  }
});



// 🚀 Inicialização
app.listen(PORT, () => {
  console.log(`✅ API rodando em http://localhost:${PORT}/news`);
});
