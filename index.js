const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());

app.get("/news", (req, res) => {
  res.json([
    {
      id: 1,
      title: "React 19 lançado",
      content: "Nova versão traz melhorias de performance e Server Components.",
      img:"https://images.unsplash.com/photo-1742684562317-b1e55040d909?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
    },
    {
      id: 2,
      title: "Node.js 22 estável",
      content: "Nova versão do Node adiciona suporte a módulos mais eficientes.",
      img:"https://images.unsplash.com/photo-1749794680236-86626308ebb7?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
    },
  ]);
});

app.listen(PORT, () => {
  console.log(`Fake API rodando em http://localhost:${PORT}`);
});
