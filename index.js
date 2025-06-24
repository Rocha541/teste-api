const express = require("express");
const axios = require("axios");
const RSSParser = require("rss-parser");
const NodeCache = require("node-cache");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
const PORT = 5000;
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutos
const parser = new RSSParser();

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

app.use(cors());

function getQueryNumber(value, fallback) {
  if (Array.isArray(value)) value = value[0];
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

async function fetchFromRSS(url) {
  const feed = await parser.parseURL(url);

  function extractCategoryFromLink(link) {
    if (!link) return "general";
    const match = link.match(/g1\.globo\.com\/([^\/]+)\//);
    return match && match[1] ? match[1].toLowerCase() : "general";
  }

  return feed.items
    .map((item) => {
      let image = null;
      if (item.enclosure?.url) image = item.enclosure.url;
      else if (item.mediaContent?.[0]?.$?.url) image = item.mediaContent[0].$.url;
      else if (item.mediaThumbnail?.[0]?.$?.url) image = item.mediaThumbnail[0].$.url;
      else if (item.content) {
        const imgMatch = item.content.match(/<img.*?src=\"(.*?)\"/);
        if (imgMatch?.[1]) image = imgMatch[1];
      }
      if (!image) return null;

      const rawDescription = item.description || item.contentSnippet || "";
      const description =
        rawDescription.length > 150 ? rawDescription.slice(0, 147).trim() + "..." : rawDescription.trim();

      const content = item["content:encoded"] || item.content || "";
      const category = extractCategoryFromLink(item.link);

      return {
        title: item.title || "Título indisponível",
        description,
        content: content.trim() || "Conteúdo não disponível",
        link: item.link || "#",
        image,
        category,
        source: feed.title || "G1",
        pubDate: item.pubDate || null,
      };
    })
    .filter(Boolean);
}

async function fetchFromGNews(category = "general") {
  const apiKey = "6030882339532b64dbf5851d6af73ec0";
  const url = `https://gnews.io/api/v4/top-headlines?lang=pt&topic=${category}&max=50&apikey=${apiKey}`;
  const response = await axios.get(url);

  return response.data.articles
    .filter((article) => article.image)
    .map((article) => ({
      title: article.title || "Título indisponível",
      description:
        article.description?.length > 150
          ? article.description.slice(0, 147).trim() + "..."
          : article.description || "Descrição não disponível",
      content: article.content || article.description || "",
      link: article.url || "#",
      image: article.image,
      category,
      source: article.source.name || null,
      pubDate: article.publishedAt || null,
    }));
}

app.get("/news", async (req, res) => {
  console.log("RAW req.query:", req.query);

  const category = (req.query.category || "geral").toString().toLowerCase();
  const page = getQueryNumber(req.query.page, 1);
  const limit = getQueryNumber(req.query.limit, 5);
  const start = (page - 1) * limit;
  const end = start + limit;

  console.log("🔎 Query recebida:", { category, page, limit, start, end });

  try {
    let allNews = cache.get(category);

    if (!allNews) {
      const rssUrl = "https://g1.globo.com/rss/g1/";
      const rssNews = await fetchFromRSS(rssUrl);
      const gnewsNews = await fetchFromGNews(category);
      allNews = [...rssNews, ...gnewsNews].filter((n) => n.title && n.link && n.image);
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

app.listen(PORT, () => {
  console.log(`✅ API rodando em http://localhost:${PORT}/news`);
});
