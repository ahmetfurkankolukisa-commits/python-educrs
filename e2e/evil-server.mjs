// Attacker site for e2e: records every request it receives. GET /__hits returns them.
import http from "node:http";

const hits = [];
const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://127.0.0.1:4323");
  if (pathname === "/health") return res.end("ok");
  if (pathname === "/__hits") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(hits)); }
  if (pathname === "/embed.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><title>evil</title><script>window.gotReady=false;addEventListener("message",e=>{if(e.data&&e.data.type==="ready")window.gotReady=true})</script><iframe src="http://127.0.0.1:4322/index.html"></iframe>`);
  }
  hits.push({ method: req.method, url: req.url });
  res.writeHead(200, { "Access-Control-Allow-Origin": "*" }).end("stolen");
});
server.on("upgrade", (req, socket) => { hits.push({ method: "UPGRADE", url: req.url }); socket.destroy(); });
server.listen(4323, "127.0.0.1", () => console.log("evil on http://127.0.0.1:4323"));
