/**
 * 체크 아이콘 컴포넌트
 *
 * 활용법 섹션에 사용되는 체크마크 SVG 아이콘입니다.
 */
function CheckCircleIcon() {
  return (
    <svg
      className="w-4 h-4 text-emerald-400 flex-shrink-0"
      fill="currentColor"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default CheckCircleIcon;