export function buildThemeMetadataTitle(
  name: string,
  stageKo: string | null,
  score: number | null,
): string {
  return stageKo && score != null
    ? `${name} 관련주 — ${stageKo} ${score}점`
    : `${name} 관련주 — 테마 생명주기 분석`
}
