const express = require("express");
const axios = require("axios");
const RSSParser = require("rss-parser");
const NodeCache = require("node-cache");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
const PORT = 5000;
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutos cache
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

async function fetchFromRSS(url) {
  const feed = await parser.parseURL(url);

  function extractCategoryFromLink(link) {
    if (!link) return "general";
    const match = link.match(/g1\.globo\.com\/([^\/]+)\//);
    if (match && match[1]) return match[1].toLowerCase();
    return "general";
  }

  return feed.items
    .map((item) => {
      // Extrair imagem
      let image = null;

      if (item.enclosure && item.enclosure.url) {
        image = item.enclosure.url;
      } else if (item.mediaContent && item.mediaContent.length > 0 && item.mediaContent[0].$.url) {
        image = item.mediaContent[0].$.url;
      } else if (item.mediaThumbnail && item.mediaThumbnail.length > 0 && item.mediaThumbnail[0].$.url) {
        image = item.mediaThumbnail[0].$.url;
      } else if (item.content) {
        const imgMatch = item.content.match(/<img.*?src="(.*?)"/);
        if (imgMatch && imgMatch[1]) image = imgMatch[1];
      }

      if (!image) return null;

      const rawDescription = item.description || item.contentSnippet || "";
      const description =
        rawDescription.length > 150 ? rawDescription.slice(0, 147).trim() + "..." : rawDescription.trim();

      const content = item["content:encoded"] || item.content || "";

      const category = extractCategoryFromLink(item.link);

      return {
        title: item.title || "Título indisponível",
        description: description || "Descrição não disponível",
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
  const apiKey = "SUA_API_KEY_AQUI"; // substitua pela sua chave da GNews
  const url = `https://gnews.io/api/v4/top-headlines?lang=pt&topic=${category}&apikey=6030882339532b64dbf5851d6af73ec0`;
  const response = await axios.get(url);

  return response.data.articles
    .filter((article) => article.image) // só com imagem
    .map((article) => ({
      title: article.title || "Título indisponível",
      description:
        article.description && article.description.length > 150
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
  const category = (req.query.category || "general").toLowerCase();

  const cached = cache.get(category);
  if (cached) return res.json(cached);

  try {
    const rssUrl = "https://g1.globo.com/rss/g1/";
    const rssNews = await fetchFromRSS(rssUrl);
    const gnewsNews = await fetchFromGNews(category);

    const allNews = [...rssNews, ...gnewsNews]
      .filter((n) => n.title && n.link && n.image)
      .slice(0, 20);

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
