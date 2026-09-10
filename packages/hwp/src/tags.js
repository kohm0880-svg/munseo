// HWP 5.x record tag ids used by Munseo's native parser.
export const HWP_TAG = Object.freeze({
  // BodyText
  PARA_HEADER: 66,
  PARA_TEXT: 67,
  PARA_CHAR_SHAPE: 68,
  PARA_LINE_SEG: 69,
  PARA_RANGE_TAG: 70,
  CTRL_HEADER: 71,
  LIST_HEADER: 72,
  PAGE_DEF: 73,
  FOOTNOTE_SHAPE: 74,
  PAGE_BORDER_FILL: 75,
  SHAPE_COMPONENT: 76,
  TABLE: 77,
  SHAPE_COMPONENT_LINE: 78,
  SHAPE_COMPONENT_RECTANGLE: 79,
  SHAPE_COMPONENT_ELLIPSE: 80,
  SHAPE_COMPONENT_ARC: 81,
  SHAPE_COMPONENT_POLYGON: 82,
  SHAPE_COMPONENT_CURVE: 83,
  SHAPE_COMPONENT_OLE: 84,
  SHAPE_COMPONENT_PICTURE: 85,
  SHAPE_COMPONENT_CONTAINER: 86,
  CTRL_DATA: 87,
  EQEDIT: 88,
  SHAPE_COMPONENT_TEXTART: 90,
  FORM_OBJECT: 91,
  MEMO_SHAPE: 92,
  MEMO_LIST: 93,
  CHART_DATA: 95,
  VIDEO_DATA: 96,
  SHAPE_COMPONENT_UNKNOWN: 99
});

export const DOCINFO_TAG = Object.freeze({
  DOCUMENT_PROPERTIES: 16,
  ID_MAPPINGS: 17,
  BIN_DATA: 18,
  FACE_NAME: 19,
  BORDER_FILL: 20,
  CHAR_SHAPE: 21,
  TAB_DEF: 22,
  NUMBERING: 23,
  BULLET: 24,
  PARA_SHAPE: 25,
  STYLE: 26,
  DOC_DATA: 27,
  DISTRIBUTE_DOC_DATA: 28,
  COMPATIBLE_DOCUMENT: 30,
  LAYOUT_COMPATIBILITY: 31
});

export function ctrlIdFromBytes(data) {
  if (!data || data.byteLength < 4) return '';
  // HWP ctrl_id is stored as little-endian u32; reversing the first four bytes
  // yields the human-readable four-character id used in the spec.
  return String.fromCharCode(data[3], data[2], data[1], data[0]);
}
