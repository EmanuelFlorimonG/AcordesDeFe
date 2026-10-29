import React from 'react';
import {
  type RecoveryEnv,
  type RecoveryPlan,
  clearRecoveryMark,
  currentBuildId,
  markRecoveryAttempt,
  planRecovery,
} from '../../pwa/chunkRecovery';

/**
 * El muro que impide que una pantalla que no se descarga se lleve por delante
 * la aplicación entera.
 *
 * Las pantallas pesadas se piden cuando hacen falta. Tras un despliegue, los
 * trozos viejos dejan de existir en el servidor, así que una pestaña que
 * lleve abierta desde antes pide un archivo que ya no está. Sin un límite de
 * error, ese rechazo dejaba el `Suspense` puesto para siempre y la
 * aplicación no terminaba de abrir.
 *
 * Lo que hace aquí depende de qué esté haciendo la persona, y ese es el
 * punto: si no hay nada en marcha, recarga sola una vez y la cosa se arregla
 * sin que nadie se entere. Si hay una misa, un ensayo o un editor con cosas
 * escritas, no toca nada: lo cuenta y espera. Recargar encima del trabajo de
 * alguien para arreglar un problema nuestro no es un arreglo.
 */

interface Props {
  children: React.ReactNode;
  /** Se inyecta en las pruebas; en la aplicación sale del navegador. */
  env?: RecoveryEnv;
  /** Para probar el componente sin que recargue de verdad. */
  reload?: () => void;
}

interface State {
  error: unknown;
  plan: RecoveryPlan | null;
}

const navegador = (): RecoveryEnv => ({
  attempts: typeof window === 'undefined' ? null : safeStorage(() => window.sessionStorage),
  data: typeof window === 'undefined' ? null : safeStorage(() => window.localStorage),
  buildId: typeof document === 'undefined' ? 'desconocida' : currentBuildId(document),
  now: Date.now,
});

/** Un almacenamiento bloqueado no debe tumbar el arranque. */
function safeStorage<T>(get: () => T): T | null {
  try {
    return get();
  } catch {
    return null;
  }
}

export class LazyScreenBoundary extends React.Component<Props, State> {
  state: State = { error: null, plan: null };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  componentDidMount(): void {
    // Llegar hasta aquí significa que la aplicación cargó. Se borra la marca
    // para que la próxima vez vuelva a haber un intento disponible.
    clearRecoveryMark(this.props.env ?? navegador());
  }

  componentDidCatch(error: unknown): void {
    const env = this.props.env ?? navegador();
    const plan = planRecovery(error, env);
    this.setState({ plan });
    if (plan.action === 'reload') {
      // Se anota ANTES de recargar: si la recarga vuelve a fallar, la marca
      // ya está puesta y no habrá una segunda.
      markRecoveryAttempt(env);
      (this.props.reload ?? (() => window.location.reload()))();
    }
  }

  private recargarAhora = () => {
    const env = this.props.env ?? navegador();
    markRecoveryAttempt(env);
    (this.props.reload ?? (() => window.location.reload()))();
  };

  render(): React.ReactNode {
    const { error, plan } = this.state;
    if (!error) return this.props.children;

    // Mientras recarga no se pinta nada: la página se va de todas formas.
    if (plan?.action === 'reload') return null;

    const ocupado = plan?.action === 'ask' ? plan.busy : null;
    const porTrabajo = plan?.action === 'ask' && plan.reason === 'busy';

    return (
      <div
        role="alert"
        className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          {plan?.action === 'show-error' ? 'Esta pantalla no se pudo abrir' : 'Hay una versión nueva'}
        </h2>
        <p className="max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {plan?.action === 'show-error'
            ? 'Algo falló al abrirla. Si vuelve a pasar, recarga la página.'
            : porTrabajo
              ? ocupado?.session
                ? 'La aplicación se actualizó mientras tenías una celebración en marcha. No se recarga sola para no cortarla: hazlo cuando puedas soltar la pantalla.'
                : 'La aplicación se actualizó y tienes cambios sin guardar en un editor. Están protegidos y seguirán ahí después de recargar.'
              : 'Ya se intentó recargar por esta versión y la pantalla sigue sin abrirse. Puede que no haya conexión.'}
        </p>
        <button
          type="button"
          onClick={this.recargarAhora}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Recargar
        </button>
        {ocupado?.drafts && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tus borradores no se pierden al recargar.
          </p>
        )}
      </div>
    );
  }
}
