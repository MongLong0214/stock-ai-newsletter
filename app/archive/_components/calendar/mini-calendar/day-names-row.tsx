/**
 * 요일 이름 헤더 행
 */

import { getDayNameColorClass } from './utils';
import type { DayNamesRowProps } from './types';

function DayNamesRow({ dayNames }: DayNamesRowProps) {
  return (
    <div role="row" className="grid grid-cols-7 gap-2 mb-3">
      {dayNames.map((dayName, index) => (
        <div
          key={dayName}
          role="columnheader"
          className={`text-center text-xs font-mono uppercase tracking-wider ${getDayNameColorClass(index)}`}
        >
          {dayName}
        </div>
      ))}
    </div>
  );
}

export default DayNamesRow;