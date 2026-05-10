// add this line before app.use("/api", router);
app.get("/", (_req, res) => res.json({ status: "ok" }));

