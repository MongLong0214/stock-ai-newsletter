# 원천과 재현

[연구 인덱스](../stock-prepare-2026-09-30.md) · [수치 결과](results.md) · [파일 manifest](artifact-manifest.json)

Git에는 실행 코드, 고정 프로토콜, 비교 결과, 독립 감사와 메타데이터를 보관한다. 원시가격·훈련/선정 원장·바이너리 모델·예측 cache는 제외했다. **Git checkout만으로 원래 모든 실행을 바로 재생할 수 있다는 뜻은 아니다.** 아래 입력을 보존하거나 새로 수집해야 한다. 재수집 시 현재 조정주가/상태가 바뀔 수 있으므로 당시 byte-identical 재현이 아니라 새 vintage 연구가 된다.

## 보관 구조와 원래 경로

| Git 하위 경로 | 원래 위치 / 목적 |
|---|---|
| `research/` | `/tmp/composite-score-research-20260930/`: 원래 점수·피처·학습 연구 |
| `experimental/` | `/tmp/composite-score-experimental-20260930/`: 원천 확대·30설정·통계 |
| `earlier-independent/` | `/tmp/composite-score-independent-*-20260930.*`: 별도 구현의 원시 자료 감사 |
| `input-metadata/` | KIS 다운로드·현재 master·평가 캘린더 메타데이터; 각 실제 원래 경로는 manifest |
| `actual-prepare/` | 9/29·9/30 prepare 스냅샷과 요약. 로그/환경 파일은 제외 |
| `original-reports/` | 당시 작성한 두 전체 보고서의 원문 gzip |

[restore_snapshot.py](restore_snapshot.py)는 Git 파일 SHA와 압축 해제 후 원문 SHA를 확인하고, 지정한 별도 폴더에 원래 `/tmp` 구조와 `.ts` 확장자를 복원한다. 다른 내용의 기존 파일은 덮어쓰지 않는다. 복원만 하며 실행·네트워크·DB 작업은 없다.

```sh
python3 docs/research/stock-prepare-2026-09-30/restore_snapshot.py /tmp/stock-research-restore
```

이 명령의 결과는 `/tmp/stock-research-restore/tmp/composite-score-...`다. 과거 스크립트는 원래 `/tmp/composite-score-...` 및 `/Users/isaac/WebstormProjects/stock-ai-newsletter`를 절대경로로 참조한다. 다른 호스트에서 재생할 때는 **분리된 호스트/작업환경에서** 그 경로를 복원하거나 새 실험용 사본의 경로를 수정한다. 경로를 수정한 소스는 새 SHA를 갖는 후속 연구이며 과거 frozen protocol 검증을 무력화하여 동일 실험이라고 부르지 않는다. 기존 로컬 원본 위로 복원하지 않는다.

많은 감사와 학습 스크립트는 입력/소스 SHA가 과거 값과 다르면 의도적으로 중단한다. 메타데이터만 있고 그 메타데이터가 가리키는 `.ndjson`/`.npy`/모델 파일이 없는 경우에도 실행할 수 없다. 단순히 assert를 지우지 않는다.

## 대용량 입력

| 입력 | 실제 원래 경로 | SHA-256 |
|---|---|---|
| KIS 가격, 원래 prefix+9/29 append | `/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson` | `c0fe673a5c0cef5197625d2ccd811c900bbe6655e81a66f4b797c6e741a1ce54` |
| NAVER 정규화 가격 | `/tmp/composite-score-experimental-20260930/naver-history/prices.ndjson` | `6347d11d70043a9016f751f8f4c1de31f4498c20d29f7e69688b8e76dbd003a8` |
| 고정 master 스냅샷 | `/tmp/composite-score-experimental-20260930/naver-history/master-snapshot.json` | `45d0f4419f49f2bdf4eacc8dbbf68e35c2f9de1f6d082ec3573ac3d5a5235c00` |

개별 선정 원장과 캐시의 해시는 [large-artifacts.json](large-artifacts.json), [NAVER cache manifest](experimental/naver-cache/manifest.json.gz), [TS 관측 manifest](experimental/naver-ts-observed/manifest.json.gz), [최종 피처 manifest](experimental/manifest.json)에 있다. 원시 XML은 `naver-history/raw/`에 있고 응답별 해시는 `naver-history/checkpoints.ndjson`에 있다. 모든 로컬 원본은 연구 당시 `/tmp` 위치에 보존했으나 `/tmp`는 영구 보관소가 아니다. 별도 로컬 archive가 생성됐다면 실제 파일 존재와 해시를 확인한 뒤 보조 복원원으로 사용한다. 이 문서는 미생성 archive를 존재한다고 가정하지 않는다.

KIS 입력은 read-only DB export와 별도 수집 append다. 코드가 symbol/date 중복 chunk를 합치고 완전히 같은 중복은 한 번만 남기며 충돌은 거부한다. append chunk만으로 긴 이전 symbol history를 덮어쓰면 안 된다. export에 개별 API envelope/원래 ingestion timestamp는 없어서 이것만으로 모든 역사 봉의 생성 이력을 확정할 수 없다.

NAVER 수집은 [collect-naver-history.py](experimental/collect-naver-history.py), 원시 대조는 [audit-naver-history.py](experimental/audit-naver-history.py)다. 공용 endpoint는 다음이며 인증정보가 필요 없다.

```text
https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count=2000&requestType=0
```

당시 2,431현재 master+KOSPI, 1 request/sec, 최대3회 retry/backoff로 약41분 걸렸다. 원문 EUC-KR XML을 그대로 저장하고 identity/date/6필드/중복을 검증했다. cutoff는 2026-09-29로 고정했다. 가격은 `[symbol, rows]` 한 줄, row는 `symbol, trade_date, open, high, low, close, volume, source:'naver-fchart', flags`다. 무효/정지/rounding-like 값은 원본 유지·flag만 기록한다. KIS로 빈 봉을 채우지 않는다.

이 collector를 미래에 그대로 실행하면 당시 count2000이 포함했던 가장 오래된 날짜가 빠질 수 있다. 현재 고정 universe와 cutoff도 과거 실험용이다. 새 연구용 collector는 목적 날짜와 snapshot을 새로 고정해야 한다. 기존 checkpoint를 사용한 재개는 원문·정규화 byte hash가 맞을 때만 가능하다.

## 실행 환경과 코드 시점

확인한 환경은 macOS, Node `v24.18.0`, npm `11.16.0`, uv `0.9.25`다. `pnpm`은 없었으며 저장소 로컬 실행파일을 사용했다. 기본 `python3`는3.14.7, `/usr/bin/python3`는3.9.6이었다. 실제 고정 과학 의존성 probe 환경은 CPython **3.14.2**였다. 과학 모델의 PEP723 스크립트는 Python≥3.12 및 **numpy==2.5.3, scikit-learn==1.9.1, lightgbm==4.7.0**를 요구한다. [dependency-probe.py](experimental/dependency-probe.py)와 각 실행 파일 상단이 정확한 요구조건이다. LightGBM은 기본 경로에서 `libomp.dylib`를 찾지 못했다. 최종적으로 동일 고정 sklearn wheel의 `.dylibs`를 `DYLD_LIBRARY_PATH`로 지정해 import를 확인했다. `KMP_DUPLICATE_LIB_OK` 같은 검증 우회는 사용하지 않았다. XML 감사에는 기본 Python의 `pyexpat` 동적 링크 오류가 있어 동작 확인된 시스템 Python을 사용했다. 파서를 바꾸며 원시 숫자를 보정하지 않았다.

- 교정 점수 기준 커밋: `97b0c2ffa7b89a7ffdd4bae53e4c0e416e00f22f` (PR217).
- 심화 연구 시점 main: `1b0e2d2ca0cfced224fc143032f5bc630c939764` (PR218 Summary 변경).
- 실제 9/29 prepare: `277d64161f44e1e1b7ece2f7aaa10a7a14f2955b`.
- 실제 9/30 오전 prepare: `87613f95379ca5f22393677dd7e1429f7085daa0`.
- 최종 새 운영 반영 커밋은 [운영 기록](deployment.md)에서 별도로 확인한다.

TS 스크립트는 위 시점의 실제 repository 함수들을 import한다. 각 manifest의 `sourceHashes`를 확인하여 대상 커밋/파일을 맞춘다. 최신 `main`을 가져와 이전 model/source guard가 그대로 재현된다고 가정하지 않는다. 현재 문서 안의 `.ts.txt`는 연구 원본 텍스트이며 제품 빌드 입력이 아니다.

당시 성공한 과학 환경의 로컬 경로는 다음과 같다. 캐시 경로 자체는 다른 머신에서 같지 않다. 새 환경에서는 같은 패키지 버전을 설치하고 그 환경의 sklearn `.dylibs` 위치를 사용한다. 아래 `STOCK_RESEARCH_*` 값은 연구용 변수이며 비밀정보가 아니다.

```sh
STOCK_RESEARCH_PYTHON=/Users/isaac/.cache/uv/environments-v2/dependency-probe-1803a242fbf4f404/bin/python
STOCK_RESEARCH_OMP_DIR=/Users/isaac/.cache/uv/environments-v2/dependency-probe-1803a242fbf4f404/lib/python3.14/site-packages/sklearn/.dylibs
DYLD_LIBRARY_PATH="$STOCK_RESEARCH_OMP_DIR" "$STOCK_RESEARCH_PYTHON" /tmp/composite-score-experimental-20260930/dependency-probe.py
```

이 environment에서 출력된 버전은 numpy2.5.3 / sklearn1.9.1 / lightgbm4.7.0이었다. 아래 `uv run` 모델 명령도 macOS에서는 이 `DYLD_LIBRARY_PATH` 설정이 필요하다. PEP723가 없는 FP 실행 파일에는 의존성을 명시적으로 주었다.

## 단계별 실행 진입점

아래는 **원래 경로에 입력과 정확한 소스가 복원된 분리된 환경**에서 사용한 명령 형태다. 결과 파일을 생성/갱신하는 연구 코드이므로 보관 원본에서 직접 재실행하지 않는다. 초기 원자료 다운로드 자체는 아래 명령에 포함하지 않았다.

```sh
# 실제 TS 점수/관측 재생: 저장소 루트에서 실행
./node_modules/.bin/tsx --tsconfig tsconfig.json /tmp/composite-score-research-20260930/export-current-signals.ts
./node_modules/.bin/tsx --tsconfig tsconfig.json /tmp/composite-score-research-20260930/export-research-context-and-wide.ts
./node_modules/.bin/tsx --tsconfig tsconfig.json /tmp/composite-score-research-20260930/earlier-training/export-earlier-training.ts
./node_modules/.bin/tsx --tsconfig tsconfig.json /tmp/composite-score-research-20260930/earlier-training/export-runtime-eligibility.ts
./node_modules/.bin/tsx --tsconfig tsconfig.json /tmp/composite-score-research-20260930/calibration-extra/export.ts

# 고정 추가32 입력과 KIS 실험
uv run --script /tmp/composite-score-experimental-20260930/export_features.py
uv run --script /tmp/composite-score-experimental-20260930/kis-research.py
uv run --script /tmp/composite-score-experimental-20260930/kis-l0-research.py

# NAVER 입력 구축: 원문 XML/가격은 미리 복원되어 있어야 함
./node_modules/.bin/tsx --tsconfig tsconfig.json /tmp/composite-score-experimental-20260930/export-naver-ts.ts
uv run --script /tmp/composite-score-experimental-20260930/naver-cache.py

# TRAIN 승자 고정 후 primary. 기존 결과를 덮어쓰는 용도로 실행하지 않음
uv run --script /tmp/composite-score-experimental-20260930/naver-research.py --risk L5 --stage train
uv run --script /tmp/composite-score-experimental-20260930/naver-research.py --risk L0 --stage train
uv run --python 3.14.2 --with numpy==2.5.3 --with scikit-learn==1.9.1 --with lightgbm==4.7.0 python /tmp/composite-score-experimental-20260930/first-passage-study/naver_fp.py --stage train
# 위 다섯 승자가 모두 frozen되고 hash가 확인된 후에만:
uv run --script /tmp/composite-score-experimental-20260930/naver-research.py --risk L5 --stage primary
uv run --script /tmp/composite-score-experimental-20260930/naver-research.py --risk L0 --stage primary
uv run --python 3.14.2 --with numpy==2.5.3 --with scikit-learn==1.9.1 --with lightgbm==4.7.0 python /tmp/composite-score-experimental-20260930/first-passage-study/naver_fp.py --stage primary
```

NAVER exporter 후에는 `validate-naver-ts.ts`, `audit-naver-ts.ts`, `validate_naver_features.py` 및 독립 observed/protocol audit를 통과한 자료를 cache/모델에 사용했다. [최종 감사 묶음](experimental/independent-naver-complete-bundle-audit.json.gz)에 사용한 입력과 모델 provenance가 있다. FP의 [합성 경계 테스트](experimental/outcome-diagnostic/test_outcome_diagnostic.py)는 같은 봉 양 장벽, 시가 갭, 결측, Decimal 경계를 다룬다. 실제 frozen helper SHA는 `5657a863fb6e7a2ba00e7cd5269e3507f3eb240307fe01901fe267d01061dea9`다.

```sh
# 모든 frozen primary 선정 원장이 있을 때의 후처리
/usr/bin/python3 /tmp/composite-score-experimental-20260930/paired-statistics/paired_statistics.py --config /tmp/composite-score-experimental-20260930/paired-statistics/frozen-inputs.json --output /tmp/composite-score-experimental-20260930/paired-statistics/results
/usr/bin/python3 /tmp/composite-score-experimental-20260930/paired-statistics/universe_enrichment.py --config /tmp/composite-score-experimental-20260930/paired-statistics/frozen-inputs.json --output /tmp/composite-score-experimental-20260930/paired-statistics/results
/usr/bin/python3 /tmp/composite-score-experimental-20260930/paired-statistics/block20_sensitivity.py
/usr/bin/python3 /tmp/composite-score-experimental-20260930/paired-statistics/test_paired_statistics.py
```

이전 연구는 `research/*-study/*research.py`가 각각 실행 진입점이다. 그중 event/monthly에는 실행 당시 사본과 후속 수정본이 함께 있으므로 artifact-manifest의 해시·결과 report의 소스 식별을 먼저 맞춘다. 소스 원본이 보관됐다는 사실과 지금 다른 Python/BLAS 환경에서 결과가 bit-for-bit 같다는 주장은 다르다.

현재 제품 학습·추론은 저장소 `scripts/stock-picks/train-composite-utility.py`, `observed-inputs.ts`, `utility-model.ts`로 통합 중이다. 이 최신 제품 경로는 과거 연구 snapshot과 별개이며 운영 기록과 최종 테스트를 확인한다.
