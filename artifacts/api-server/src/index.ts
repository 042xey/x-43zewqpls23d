import app from "./app";
import { logger } from "./lib/logger";
import { initProxyRotator } from "./lib/proxyRotator";
import { initConfigLoader } from "./lib/configLoader";
import { resumeAllRefreshCycles } from "./lib/tokenRefresher";
import { initTunnelManager } from "./lib/tunnelManager";
import { CLIENT_ALIAS_MAP } from "./routes/generateCode";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

Promise.all([
  initProxyRotator(),
  initConfigLoader(),
  resumeAllRefreshCycles(CLIENT_ALIAS_MAP),
  initTunnelManager(),
]).then(() => {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}).catch((err) => {
  logger.error({ err }, "Failed to initialize server");
  process.exit(1);
});
