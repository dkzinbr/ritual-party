import { existsSync } from "node:fs";
import path from "node:path";
import app from "./app.ts";

if (!process.env.VERCEL) {
  const port = Number(process.env.SERVER_PORT || process.env.PORT || 8787);
  const dist = path.resolve(process.cwd(), "dist");
  app.listen(port, "0.0.0.0", () => {
    const pin = process.env.HOST_PIN || "250926";
    console.log(existsSync(dist) ? `22Evy em http://localhost:${port}` : `API em http://localhost:${port}`);
    if (!existsSync(dist)) console.log(`Durante o desenvolvimento, abra http://localhost:5173`);
    console.log(`PIN do mestre: ${pin}`);
  });
}

export default app;
