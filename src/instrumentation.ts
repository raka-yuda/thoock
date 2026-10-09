import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { appLogger } = await import("@/lib/server/logger");
  appLogger.info("app.server.started", {
    environment: process.env.NODE_ENV,
    logLevel: process.env.APP_LOG_LEVEL ?? "info",
  });
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { appLogger } = await import("@/lib/server/logger");
  appLogger.error("app.request.unhandled_error", {
    error,
    request: {
      method: request.method,
      path: request.path,
    },
    context: {
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
    },
  });
};
