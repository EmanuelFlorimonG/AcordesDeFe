import React from 'react';

/**
 * Un hook de React, sin pantalla.
 *
 * El proyecto no tiene DOM ni renderer de pruebas, y `package.json` está
 * cerrado, así que para probar un hook se le da a React lo mínimo que
 * necesita: una lista de huecos y un cursor, que es exactamente lo que es un
 * componente visto desde dentro. El estado persiste entre renders, los
 * efectos se ejecutan y se limpian, y las dependencias se comparan como las
 * compara React.
 *
 * Lo que se prueba con esto es el hook de verdad, sin tocarlo.
 */

type Hooks = Record<string, unknown>;
const internals = (
  React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: Hooks | null } }
).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

export interface Run<T> {
  /** Lo último que devolvió el hook. */
  readonly current: T;
  /** Todo lo que devolvió, render a render: sirve para ver lo que pasó en medio. */
  readonly renders: T[];
  /** Vuelve a renderizar ahora mismo, sin esperar a nada. */
  flush(): void;
  /** Deja que terminen las promesas pendientes y vuelve a renderizar. */
  settle(): Promise<void>;
  unmount(): void;
}

/** Corre un hook de verdad: estado que persiste, efectos que se ejecutan. */
export function runHook<T>(hook: () => T): Run<T> {
  const slots: unknown[] = [];
  const effects: Array<{ deps: unknown[] | undefined; cleanup?: () => void } | undefined> = [];
  const renders: T[] = [];
  let cursor = 0;
  let effectCursor = 0;
  let pending: Array<() => void> = [];
  let dirty = true;
  let result!: T;

  const same = (a: unknown[] | undefined, b: unknown[] | undefined) =>
    !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

  const slot = <V>(make: () => V): { index: number; value: V } => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = make();
    return { index, value: slots[index] as V };
  };

  const dispatcher: Hooks = {
    useState<V>(initial: V | (() => V)) {
      const { index, value } = slot(() => (typeof initial === 'function' ? (initial as () => V)() : initial));
      const set = (next: V | ((prev: V) => V)) => {
        const prev = slots[index] as V;
        const now = typeof next === 'function' ? (next as (p: V) => V)(prev) : next;
        if (Object.is(prev, now)) return;
        slots[index] = now;
        dirty = true;
      };
      return [value, set];
    },
    useReducer: undefined,
    useRef<V>(initial: V) {
      return slot(() => ({ current: initial })).value;
    },
    useMemo<V>(make: () => V, deps: unknown[] | undefined) {
      const { index, value } = slot(() => ({ deps, value: make() }));
      const held = value as { deps: unknown[] | undefined; value: V };
      if (!same(held.deps, deps)) {
        held.deps = deps;
        held.value = make();
      }
      slots[index] = held;
      return held.value;
    },
    useCallback<V>(fn: V, deps: unknown[] | undefined) {
      const { index, value } = slot(() => ({ deps, fn }));
      const held = value as { deps: unknown[] | undefined; fn: V };
      if (!same(held.deps, deps)) {
        held.deps = deps;
        held.fn = fn;
      }
      slots[index] = held;
      return held.fn;
    },
    useEffect(fn: () => void | (() => void), deps: unknown[] | undefined) {
      const index = effectCursor++;
      const before = effects[index];
      if (before && same(before.deps, deps)) return;
      pending.push(() => {
        before?.cleanup?.();
        const cleanup = fn();
        effects[index] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined };
      });
    },
    useDebugValue() {},
    useId: () => 'prueba',
  };
  dispatcher.useLayoutEffect = dispatcher.useEffect;

  const render = () => {
    for (let pass = 0; dirty && pass < 40; pass += 1) {
      dirty = false;
      cursor = 0;
      effectCursor = 0;
      const before = internals.H;
      internals.H = dispatcher;
      try {
        result = hook();
      } finally {
        internals.H = before;
      }
      renders.push(result);
      const queue = pending;
      pending = [];
      for (const effect of queue) effect();
    }
  };

  render();

  return {
    get current() {
      return result;
    },
    renders,
    flush() {
      dirty = true;
      render();
    },
    async settle() {
      // Dos vueltas al bucle de eventos: los `await` del hook y lo que
      // encadenen después.
      await new Promise((ok) => setTimeout(ok, 0));
      await new Promise((ok) => setTimeout(ok, 0));
      dirty = true;
      render();
    },
    unmount() {
      for (const effect of effects) effect?.cleanup?.();
    },
  };
}
