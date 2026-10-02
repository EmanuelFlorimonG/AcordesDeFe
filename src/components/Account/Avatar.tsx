import React, { useState } from 'react';
/** Failure is local to this URL; a new photo resets the fallback. */
export function Avatar({ url, initial }: { url?: string | null; initial: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  return url && failed !== url
    ? <img src={url} alt="" onError={() => setFailed(url)} className="w-full h-full rounded-full object-cover" />
    : <>{initial}</>;
}
