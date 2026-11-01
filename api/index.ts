import type { IncomingMessage, ServerResponse } from "node:http";
import { getServer } from "../apps/api/src/serverless.js";
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const url = new URL(req.url || "/", "http://localhost");
  const route = url.searchParams.get("__route");
  if (route !== null) {
    url.searchParams.delete("__route");
    req.url = "/api/" + route + (url.search ? url.search : "");
  }
  try {
    const { app } = await getServer();
    app.server.emit("request", req, res);
  } catch {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error:
          "Serviço temporariamente indisponível. Confira a configuração do banco.",
      }),
    );
  }
}
