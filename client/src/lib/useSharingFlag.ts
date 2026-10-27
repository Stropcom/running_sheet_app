import { useEffect, useState } from "react";
import { SHARING_EVENT, readSharingFlag } from "@/lib/nativeLocation";

/** Whether this officer has Show & Share switched on, kept current as it is
 * changed from anywhere (the Map page's side panel, the top banner, another
 * tab). The flag itself lives in localStorage — see nativeLocation.ts. */
export function useSharingFlag(userId: number | undefined): boolean {
  const [on, setOn] = useState(() => readSharingFlag(userId));
  useEffect(() => {
    const sync = () => setOn(readSharingFlag(userId));
    sync();
    window.addEventListener(SHARING_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SHARING_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [userId]);
  return on;
}
