import { readU32, toUint8Array } from './cfb-reader.js';

const HWP_SIGNATURE = 'HWP Document File';

export function parseHwpFileHeader(input) {
  const bytes = toUint8Array(input);
  if (bytes.byteLength < 40) throw new Error('HWP FileHeader가 너무 짧습니다.');

  const signature = new TextDecoder('ascii').decode(bytes.subarray(0, 32)).replace(/\u0000+$/g, '');
  if (!signature.startsWith(HWP_SIGNATURE)) throw new Error('HWP 5.x FileHeader 시그니처가 아닙니다.');

  // HWP version bytes are stored revision/build/minor/major.
  const version = {
    major: bytes[35],
    minor: bytes[34],
    build: bytes[33],
    revision: bytes[32]
  };
  const property = readU32(bytes, 36);

  return {
    signature,
    version,
    versionString: `${version.major}.${version.minor}.${version.build}.${version.revision}`,
    property,
    flags: {
      compressed: Boolean(property & (1 << 0)),
      passwordEncrypted: Boolean(property & (1 << 1)),
      distribution: Boolean(property & (1 << 2)),
      scriptStored: Boolean(property & (1 << 3)),
      drm: Boolean(property & (1 << 4)),
      xmlTemplateStored: Boolean(property & (1 << 5)),
      documentHistoryStored: Boolean(property & (1 << 6)),
      digitalSignature: Boolean(property & (1 << 7)),
      certificateEncrypted: Boolean(property & (1 << 8))
    }
  };
}

/**
 * Munseo가 대상으로 삼는 것은 평범한 편집 가능한 HWP 5.x 본문이다.
 * 암호화/배포용/DRM은 우회하거나 해제하지 않고 명시적으로 범위 밖으로 둔다.
 */
export function assertSupportedHwpScope(header) {
  const { flags } = header;
  if (flags.passwordEncrypted || flags.certificateEncrypted) {
    throw new Error('암호화된 HWP는 Munseo 지원 범위가 아닙니다.');
  }
  if (flags.distribution) throw new Error('배포용 HWP는 Munseo 지원 범위가 아닙니다.');
  if (flags.drm) throw new Error('DRM이 적용된 HWP는 Munseo 지원 범위가 아닙니다.');
  if (header.version.major !== 5) throw new Error(`HWP ${header.versionString}은 지원 범위가 아닙니다. HWP 5.x만 대상으로 합니다.`);
}
