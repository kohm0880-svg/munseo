import { importHwpx } from '../../hwpx/src/importer.js';

const HWP_BRIDGE_URL = 'https://cdn.jsdelivr.net/npm/@ssabrojs/hwpxjs@0.4.0/dist/browser/hwpxjs.browser.mjs';
let defaultBridgePromise = null;

export async function loadDefaultHwpBridge() {
  if (!defaultBridgePromise) {
    defaultBridgePromise = import(HWP_BRIDGE_URL).catch((error) => {
      defaultBridgePromise = null;
      throw error;
    });
  }
  return defaultBridgePromise;
}

export async function importHwp(file, { mode = 'general', bridgeLoader = loadDefaultHwpBridge } = {}) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bridge;
  try {
    bridge = await bridgeLoader();
  } catch (error) {
    throw new Error(`HWP 변환 모듈을 불러오지 못했습니다. 인터넷 연결을 확인해주세요. (${error?.message || error})`);
  }

  const detected = typeof bridge.detectFormat === 'function' ? bridge.detectFormat(bytes) : 'hwp';
  if (detected === 'hwp3') throw new Error('현재는 HWP 5.x 파일만 지원합니다. HWP 3.x는 아직 열 수 없습니다.');
  if (detected && detected !== 'hwp') throw new Error('HWP 5.x 파일로 인식되지 않습니다. 파일 형식을 확인해주세요.');
  if (typeof bridge.hwpToHwpx !== 'function') throw new Error('HWP 변환 모듈의 hwpToHwpx 기능을 찾지 못했습니다.');

  let hwpxBytes;
  try {
    hwpxBytes = await bridge.hwpToHwpx(bytes, {
      title: file.name.replace(/\.hwp$/i, ''),
      creator: 'Munseo'
    });
  } catch (error) {
    throw new Error(normalizeHwpError(error));
  }

  const converted = memoryFile(`${file.name.replace(/\.hwp$/i, '')}.hwpx`, hwpxBytes);
  const result = await importHwpx(converted, { mode });

  result.originalFile = file;
  result.document.source = {
    format: 'hwp',
    name: file.name,
    normalizedThrough: 'hwpx',
    bridge: '@ssabrojs/hwpxjs@0.4.0'
  };
  result.warnings = [
    'HWP 5.x를 브라우저에서 HWPX 구조로 정규화한 뒤 Munseo 문서로 가져왔습니다.',
    ...(result.warnings || [])
  ];
  return result;
}

export function memoryFile(name, input) {
  const bytes = toUint8Array(input);
  return {
    name,
    size: bytes.byteLength,
    type: 'application/vnd.hancom.hwpx',
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  };
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error('HWP 변환 결과가 바이트 배열이 아닙니다.');
}

function normalizeHwpError(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || error || '알 수 없는 오류');
  const combined = `${name} ${message}`.toLowerCase();

  if (combined.includes('encrypt') || combined.includes('password') || combined.includes('암호')) {
    return '암호화된 HWP 문서는 아직 지원하지 않습니다.';
  }
  if (combined.includes('hwp3') || combined.includes('3.0')) {
    return '현재는 HWP 5.x 파일만 지원합니다. HWP 3.x는 아직 열 수 없습니다.';
  }
  if (combined.includes('distribution') || combined.includes('viewtext') || combined.includes('배포')) {
    return '이 HWP는 배포용/보호 문서라 현재 편집용으로 가져올 수 없습니다.';
  }
  return `HWP를 읽는 중 오류가 발생했습니다: ${message}`;
}
