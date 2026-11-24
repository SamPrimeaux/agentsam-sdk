/** Shared drag payload for moving project media from the media browser to the timeline. */
export const COPRO_MEDIA_DRAG_TYPE = "application/x-inneranimalmedia-copro-media";

export function writeCoProMediaDragData(dataTransfer: DataTransfer, mediaId: string, label: string, mediaKind: string): void {
  const trackKind = mediaKind === "audio" ? "audio" : mediaKind === "image" ? "overlay" : "video";
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(COPRO_MEDIA_DRAG_TYPE, mediaId);
  dataTransfer.setData(COPRO_MEDIA_DRAG_TYPE + "-" + trackKind, "1");
  dataTransfer.setData("text/plain", label);
}

export function isCoProMediaDragForTrack(dataTransfer: DataTransfer, trackKind: string): boolean {
  return Array.from(dataTransfer.types).includes(COPRO_MEDIA_DRAG_TYPE + "-" + trackKind);
}

export function readCoProMediaDragId(dataTransfer: DataTransfer): string {
  return dataTransfer.getData(COPRO_MEDIA_DRAG_TYPE).trim();
}
