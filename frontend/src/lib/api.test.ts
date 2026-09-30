import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, type ApiError } from "./api";

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("fetchJson", () => {
  it("patiente pendant le chargement du modèle puis renvoie les données", async () => {
    vi.useFakeTimers();
    const f = vi.fn()
      .mockResolvedValueOnce(res(503, { error: "model_loading", message: "Chargement…" }))
      .mockResolvedValueOnce(res(200, { ok: 1 }));
    vi.stubGlobal("fetch", f);
    const p = fetchJson<{ ok: number }>("/api/test-attente");
    await vi.advanceTimersByTimeAsync(3100);
    await expect(p).resolves.toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("remonte le message et le conseil du serveur", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(503, { error: "fabric_connection", message: "Impossible de joindre Fabric.", hint: "Vérifiez le VPN." })));
    const e = (await fetchJson("/api/test-erreur").catch((x) => x)) as ApiError;
    expect(e.message).toBe("Impossible de joindre Fabric.");
    expect(e.code).toBe("fabric_connection");
    expect(e.hint).toBe("Vérifiez le VPN.");
    expect(e.status).toBe(503);
  });
});
