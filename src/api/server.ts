import { timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { deviceStatePayloadSchema } from "../domain/door-state.js";
import type { IngestResult, DoorStateService } from "../services/door-state-service.js";

export type ApiOptions = {
  deviceApiKey: string;
  deviceId: string;
  stateService: DoorStateService;
  onStateAccepted: (result: IngestResult) => Promise<void>;
  discordConnected?: () => boolean;
  logger?: boolean;
};

function hasValidAuthorization(header: string | undefined, expectedKey: string): boolean {
  if (header === undefined || !header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(expectedKey);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function buildApi(options: ApiOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.get("/health", async (_request, reply) => {
    const databaseOk = options.stateService.isDatabaseHealthy();
    const discord = options.discordConnected?.() === true ? "connected" : "disconnected";
    return reply.code(databaseOk ? 200 : 503).send({
      ok: databaseOk,
      discord,
      database: databaseOk ? "ok" : "error",
    });
  });

  app.post("/api/v1/device/state", async (request, reply) => {
    if (!hasValidAuthorization(request.headers.authorization, options.deviceApiKey)) {
      return reply.code(401).send({ ok: false, error: "Unauthorized" });
    }

    const parsed = deviceStatePayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid payload" });
    }
    if (parsed.data.deviceId !== options.deviceId) {
      return reply.code(404).send({ ok: false, error: "Unknown device" });
    }

    const result = options.stateService.ingest(parsed.data);
    if (result.ignored) {
      request.log.warn(
        { device: parsed.data.deviceId, measuredAt: parsed.data.measuredAt },
        "outdated or conflicting device state ignored",
      );
      return reply.code(200).send({ ok: true });
    }

    request.log.info(
      { device: parsed.data.deviceId, state: parsed.data.state },
      "device state received",
    );
    try {
      await options.onStateAccepted(result);
    } catch (error: unknown) {
      request.log.error({ err: error }, "Discord notification failed after state was saved");
    }
    return reply.code(200).send({ ok: true });
  });

  return app;
}
