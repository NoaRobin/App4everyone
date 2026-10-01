import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, type ApiError } from "./api";

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("fetchJson", () => {
  it("patiente pendant le chargement du modèle (une seule boucle /api/health) puis renvoie les données", async () => {
    vi.useFakeTimers();
    let ready = false;
    const calls: string[] = [];
    const f = vi.fn(async (url: string) => {
      calls.push(url);
      if (url === "/api/health") return res(200, { model: { state: ready ? "ready" : "loading" } });
      return ready ? res(200, { ok: url }) : res(503, { error: "model_loading", message: "Chargement…" });
    });
    vi.stubGlobal("fetch", f);
    const a = fetchJson<{ ok: string }>("/api/test-attente-a");
    const b = fetchJson<{ ok: string }>("/api/test-attente-b");
    await vi.advanceTimersByTimeAsync(1600);
    ready = true;
    await vi.advanceTimersByTimeAsync(1600);
    await expect(a).resolves.toEqual({ ok: "/api/test-attente-a" });
    await expect(b).resolves.toEqual({ ok: "/api/test-attente-b" });
    // Deux requêtes en attente, mais une seule interrogation de /api/health à la fois
    expect(calls.filter((u) => u === "/api/health").length).toBeLessThanOrEqual(2);
    expect(calls.filter((u) => u === "/api/test-attente-a").length).toBe(2);
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
