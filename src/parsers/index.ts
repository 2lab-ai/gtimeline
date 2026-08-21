import type { ParseResult } from '../types'
import { parsePhoneExport } from './phone'
import { parseRecords } from './records'
import { parseSemantic } from './semantic'

export class UnrecognizedFormatError extends Error {
  constructor(fileName: string) {
    super(`인식할 수 없는 파일 형식: ${fileName} — 구글 타임라인 내보내기 JSON(Timeline.json, Records.json, Semantic Location History)만 지원한다.`)
  }
}

/** Detect + parse any of the known Google timeline export formats. */
export function parseTimelineJson(fileName: string, json: unknown): ParseResult {
  if (Array.isArray(json)) {
    const first = json.find((x) => x && typeof x === 'object') as Record<string, unknown> | undefined
    if (first && (first.visit || first.activity || first.timelinePath || first.position || first.startTime)) {
      return parsePhoneExport(fileName, json, 'phone-array')
    }
    throw new UnrecognizedFormatError(fileName)
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    if (o.semanticSegments || o.rawSignals) return parsePhoneExport(fileName, o, 'phone-object')
    if (o.locations) return parseRecords(fileName, o)
    if (o.timelineObjects) return parseSemantic(fileName, o)
  }
  throw new UnrecognizedFormatError(fileName)
}
