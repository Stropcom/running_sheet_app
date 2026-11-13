// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page used to be one
// 13,400-line function; its state, effects and handlers are now these step hooks, called in order by
// useMapScreen. Same code as before (only refs, callbacks and plain definitions were moved earlier,
// never an effect); see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useMapBasics } from "./useMapBasics";
import { useMapPanes } from "./useMapPanes";
import { useMapPlacing } from "./useMapPlacing";
import { useMapAddressSearch } from "./useMapAddressSearch";
import { useMapData } from "./useMapData";
import { useMapRsDraft } from "./useMapRsDraft";
import { useMapSharing } from "./useMapSharing";
import { useMapFly } from "./useMapFly";
import { useMapMarkers } from "./useMapMarkers";
import { useMapReady } from "./useMapReady";
import { useMapShapes } from "./useMapShapes";
import { useMapShapeEdit } from "./useMapShapeEdit";
import { useMapPlacePosition } from "./useMapPlacePosition";
import { useMapNearby } from "./useMapNearby";
import { useMapPins } from "./useMapPins";
import { useMapInlineEntry } from "./useMapInlineEntry";

/** The whole state of the Map page: what the step hooks make, for the layout components to read. */
export function useMapScreen() {
  const s0 = useMapBasics();
  const s1 = useMapPanes({ ...s0 });
  const s2 = useMapPlacing({ ...s0, ...s1 });
  const s3 = useMapAddressSearch({ ...s0, ...s1, ...s2 });
  const s4 = useMapData({ ...s0, ...s1, ...s2, ...s3 });
  const s5 = useMapRsDraft({ ...s0, ...s1, ...s2, ...s3, ...s4 });
  const s6 = useMapSharing({ ...s0, ...s1, ...s2, ...s3, ...s4, ...s5 });
  const s7 = useMapFly({ ...s0, ...s1, ...s2, ...s3, ...s4, ...s5, ...s6 });
  const s8 = useMapMarkers({
    ...s0,
    ...s1,
    ...s2,
    ...s3,
    ...s4,
    ...s5,
    ...s6,
    ...s7,
  });
  const s9 = useMapReady({
    ...s0,
    ...s1,
    ...s2,
    ...s3,
    ...s4,
    ...s5,
    ...s6,
    ...s7,
    ...s8,
  });
  const s10 = useMapShapes({
    ...s0,
    ...s1,
    ...s2,
    ...s3,
    ...s4,
    ...s5,
    ...s6,
    ...s7,
    ...s8,
    ...s9,
  });
  useMapShapeEdit({
    ...s0,
    ...s1,
    ...s2,
    ...s3,
    ...s4,
    ...s5,
    ...s6,
    ...s7,
    ...s8,
    ...s9,
    ...s10,
  });
  const s12 = useMapPlacePosition({
    ...s0,
    ...s1,
    ...s2,
    ...s3,
    ...s4,
    ...s5,
    ...s6,
    ...s7,
    ...s8,
    ...s9,
    ...s10,
  });
  const s13 = useMapNearby({
    ...s0,
    ...s1,
    ...s2,
    ...s3,
    ...s4,
    ...s5,
    ...s6,
    ...s7,
    ...s8,
    ...s9,
    ...s10,
    ...s12,
  });
  const s14 = useMapPins({
    ...s0,
    ...s1,
    ...s2,
    ...s3,
    ...s4,
    ...s5,
    ...s6,
    ...s7,
    ...s8,
    ...s9,
    ...s10,
    ...s12,
    ...s13,
  });
  const s15 = useMapInlineEntry({
    ...s0,
    ...s1,
    ...s2,
    ...s3,
    ...s4,
    ...s5,
    ...s6,
    ...s7,
    ...s8,
    ...s9,
    ...s10,
    ...s12,
    ...s13,
    ...s14,
  });

  return {
    ...s0,
    ...s1,
    ...s2,
    ...s3,
    ...s4,
    ...s5,
    ...s6,
    ...s7,
    ...s8,
    ...s9,
    ...s10,
    ...s12,
    ...s13,
    ...s14,
    ...s15,
  };
}

export type MapScreen = ReturnType<typeof useMapScreen>;
