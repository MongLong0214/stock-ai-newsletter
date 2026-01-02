# 코드 스타일 및 컨벤션

## React 19 최적화 규칙
- **memo/useMemo/useCallback 불필요**: React 19 자동 최적화 활용
- 단순 연산 (문자열 join, 객체 생성 등)은 useMemo 없이 직접 계산
- 함수 정의는 useCallback 대신 일반 function 사용

## TypeScript
- **any 타입 절대 금지**: unknown + type guard 사용
- 모든 props에 interface 정의 필수
- branded type 사용 (예: DateString)

## 파일 네이밍
- **컴포넌트**: kebab-case 폴더, PascalCase 파일 (또는 index.tsx)
- **훅**: use-*.ts (kebab-case)
- **유틸리티**: *.ts (kebab-case)
- **타입**: types.ts
- **상수**: constants.ts

## 폴더 구조
- `_components/`: 컴포넌트
- `_hooks/`: 커스텀 훅
- `_utils/`: 유틸리티 함수
- `_types/`: 타입 정의
- `_constants/`: 상수

## Barrel Export 금지
index.tsx에서 `export * from` 절대 금지. 컴포넌트 직접 구현만 허용.

## 주석 스타일
- JSDoc으로 함수/컴포넌트 설명
- 한국어 주석 사용 (팀 규칙)
- 불필요한 주석 제거

## Tailwind CSS
- 인라인 스타일 금지
- className으로 모든 스타일링
