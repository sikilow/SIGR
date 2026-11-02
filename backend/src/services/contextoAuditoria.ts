import { AsyncLocalStorage } from "node:async_hooks";

const actor = new AsyncLocalStorage<number | null>();

export function conActorAuditoria<T>(idUsuario: number, ejecutar: () => T): T {
  return actor.run(idUsuario, ejecutar);
}

export function actorAuditoriaActual(): number | null {
  return actor.getStore() ?? null;
}
