import React from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import type { Setlist } from '../../types/setlist';
import type { Song } from '../../types/song';
import { SetlistPrintSheetFor } from './SetlistPrintSheet';
import { primaryButton, secondaryButton } from './ui';

/**
 * La vista previa de lo que va a salir por la impresora.
 *
 * Se enseña antes de imprimir a propósito: nadie debería descubrir cómo ha
 * quedado su Setlist después de gastar ocho hojas. Lo que hay en pantalla es
 * exactamente lo que se imprime — la barra de arriba es lo único que no sale.
 *
 * El PDF lo hace el navegador, eligiendo «Guardar como PDF» en el diálogo de
 * impresión. Es lo que ya hace la página de una canción (ver SongViewer), y
 * significa que el documento sale con las tipografías de verdad, con los
 * cortes de página que decide el propio navegador y sin añadir ni una
 * dependencia para escribir PDFs a mano.
 */

interface SetlistPrintScreenProps {
  /** Null cuando el Setlist ya no existe: un enlace viejo, o se borró. */
  setlist: Setlist | null;
  songsById: Map<string, Song>;
  onBack: () => void;
}

export const SetlistPrintScreen: React.FC<SetlistPrintScreenProps> = ({ setlist, songsById, onBack }) => {
  if (!setlist) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Este Setlist ya no está.</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Puede que se haya eliminado desde este dispositivo o desde otro.
        </p>
        <button type="button" onClick={onBack} className={`${primaryButton} mt-6`}>
          Volver a mis Setlists
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 print:p-0 print:max-w-none">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button type="button" onClick={onBack} className={secondaryButton}>
          <ArrowLeft className="w-4 h-4" />
          Volver al Setlist
        </button>
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            En el diálogo de impresión elige <strong className="font-semibold">Guardar como PDF</strong>.
          </p>
          <button type="button" onClick={() => window.print()} className={primaryButton}>
            <Printer className="w-4 h-4" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Fondo blanco siempre, también en modo oscuro: esto es papel. */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-10 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <SetlistPrintSheetFor setlist={setlist} songsById={songsById} />
      </div>
    </div>
  );
};
