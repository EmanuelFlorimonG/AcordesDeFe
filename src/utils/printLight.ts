/**
 * Papel blanco, siempre.
 *
 * El modo oscuro de la aplicación es una clase en la raíz, y las utilidades
 * `dark:` cuelgan de ella. Al imprimir esa clase seguía puesta, así que quien
 * tuviera la aplicación en oscuro obtenía letra clara sobre papel blanco: una
 * hoja en blanco, o casi. Y no se nota hasta que sale de la impresora.
 *
 * Se quita mientras se imprime y se vuelve a poner al terminar. Va aquí y no
 * en cada pantalla porque el problema es de todas las que se imprimen: la
 * página de una canción ya lo tenía, y cualquiera que venga después lo
 * tendría también.
 *
 * Escuchar `beforeprint` en vez de envolver `window.print()` es lo que hace
 * que funcione también cuando alguien imprime con Ctrl+P o desde el menú del
 * navegador, que es como imprime media humanidad.
 */
export function installPrintLightMode(): () => void {
  const root = document.documentElement;
  let restoreDark = false;

  const lighten = () => {
    restoreDark = root.classList.contains('dark');
    if (restoreDark) root.classList.remove('dark');
  };
  const restore = () => {
    if (restoreDark) root.classList.add('dark');
    restoreDark = false;
  };

  window.addEventListener('beforeprint', lighten);
  window.addEventListener('afterprint', restore);
  return () => {
    window.removeEventListener('beforeprint', lighten);
    window.removeEventListener('afterprint', restore);
    restore();
  };
}
