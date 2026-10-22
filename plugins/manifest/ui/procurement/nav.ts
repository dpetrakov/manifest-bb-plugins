// «Open in «Источники»»: from a card, «Покрытие» or «Проверить» to the catalog's place in
// the procurement sheet, where its contents are seen and a draft is confirmed or rejected.
import { useCallback } from "react";
import { useOpenObject, useOpenPinned } from "../workspace/state";
import { NEEDS_HUB, requestSource } from "./paths";

export function useOpenSource() {
  const openPinned = useOpenPinned();
  const openObject = useOpenObject();
  return useCallback(
    (sourceId: string) => {
      if (requestSource(sourceId)) return; // the sheet is open here: it switched itself
      if (!openPinned(NEEDS_HUB)) void openObject(NEEDS_HUB);
    },
    [openPinned, openObject],
  );
}
