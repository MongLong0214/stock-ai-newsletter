# Third-Party Notices

이 저장소는 아래 서드파티 저작물의 일부를 포함하거나 번안해 사용합니다.

---

## Humanize KR (im-not-ai)

- 출처: https://github.com/epoko77-ai/im-not-ai
- 라이선스: MIT

블로그 생성 파이프라인의 윤문(AI 문체 제거) 단계는 이 프로젝트를 이식한 것입니다.

| 이 저장소 | 원본 |
|---|---|
| `app/blog/_prompts/humanize.ts` | `.claude/skills/humanize-korean/references/quick-rules.md` (A~J 룰북), `agents/humanize-monolith.md` (철칙·자체검증) |
| `app/blog/_utils/change-rate.ts` | `.claude/skills/humanize-korean/references/metrics_v2.py::change_rate()`, `scripts/verify_change_rate.py` |

원본은 Claude Code 스킬(Python + 프롬프트)이고 이 저장소는 Next.js/TypeScript 배치 파이프라인이라,
동작을 그대로 옮기는 대신 규칙 텍스트와 게이트 임계값(0.30 경고 / 0.50 중단)을 번안했습니다.

```
MIT License

Copyright (c) 2026 epoko77-ai

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
