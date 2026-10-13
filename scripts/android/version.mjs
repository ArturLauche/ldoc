export function androidVersion(tag) {
  const match = /^v(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/.exec(tag);
  if (!match) throw new Error('Expected a stable tag: vMAJOR.MINOR.PATCH (no prerelease or build suffix).');
  const [, major, minor, patch] = match.map((part, index) => index === 0 ? part : Number(part));
  const versionCode = major * 1_000_000 + minor * 1_000 + patch;
  if (major > 2000 || versionCode < 1) throw new Error('Version must be nonzero; major <= 2000 and minor/patch <= 999.');
  return { tag, versionName: tag.slice(1), versionCode, apkName: `LWrite-Android-${tag}.apk` };
}
