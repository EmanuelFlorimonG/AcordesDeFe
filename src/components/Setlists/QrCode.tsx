import React, { useMemo } from 'react';
import { encodeQr } from '../../utils/qrCode';

/**
 * El enlace, dibujado para que alguien lo apunte con el móvil.
 *
 * Se dibuja aquí, en el navegador: la URL no sale a ningún servicio de
 * terceros para que devuelva una imagen. Es un SVG y no un canvas para que se
 * vea nítido en cualquier pantalla y al imprimirlo.
 *
 * El margen blanco alrededor no es decoración: un lector necesita ese borde
 * para encontrar el código.
 */

interface QrCodeProps {
  /** Exactamente lo que leerá quien lo escanee. */
  value: string;
  /** Lado en píxeles. */
  size?: number;
  /** Para quien no puede verlo: qué es esto. */
  label: string;
}

const QUIET = 4;

export const QrCode: React.FC<QrCodeProps> = ({ value, size = 200, label }) => {
  const code = useMemo(() => {
    try {
      return encodeQr(value);
    } catch {
      // Un enlace que no cabe: mejor no dibujar nada que dibujar algo que no
      // lleva a ninguna parte. El enlace copiable sigue estando.
      return null;
    }
  }, [value]);

  if (!code) return null;

  const side = code.size + QUIET * 2;
  // Un solo trazado con todos los módulos: un <rect> por módulo serían
  // cientos de nodos para el navegador y para quien lea el SVG.
  const path: string[] = [];
  for (let row = 0; row < code.size; row += 1) {
    for (let column = 0; column < code.size; column += 1) {
      if (code.modules[row][column]) path.push(`M${column + QUIET} ${row + QUIET}h1v1h-1z`);
    }
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${side} ${side}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-lg"
    >
      <rect width={side} height={side} fill="#ffffff" />
      <path d={path.join('')} fill="#10203A" />
    </svg>
  );
};
