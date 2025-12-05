import { cn } from '@/lib/utils';
import { Icons } from '../shared/icons';

interface ActiveFiltersProps {
  resultCount: number;
  onClear: () => void;
}

export function ActiveFilters({ resultCount, onClear }: ActiveFiltersProps) {
  return (
    <div className="relative group">
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-emerald-400/10 rounded-2xl blur-md opacity-50" />

      <div className="relative flex items-center justify-between py-4 px-6 rounded-2xl bg-gradient-to-br from-gray-900/80 to-gray-900/60 backdrop-blur-sm border border-emerald-500/20 shadow-xl shadow-emerald-500/5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-sm text-gray-300">
              <span className="font-bold text-emerald-400 tabular-nums text-lg">{resultCount}</span>
              <span className="ml-2 text-gray-500">개의 결과</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClear}
          className={cn(
            'group/btn relative inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl',
            'bg-gradient-to-br from-emerald-500/20 to-emerald-400/10',
            'border border-emerald-500/30',
            'text-emerald-400',
            'hover:from-emerald-500/30 hover:to-emerald-400/20',
            'hover:border-emerald-500/50 hover:text-emerald-300',
            'hover:shadow-lg hover:shadow-emerald-500/20',
            'transition-all duration-300 ease-out',
            'hover:-translate-y-0.5',
            'overflow-hidden'
          )}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/10 to-emerald-500/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700" />
          <Icons.Refresh className="w-4 h-4 relative group-hover/btn:rotate-180 transition-transform duration-500" />
          <span className="relative">초기화</span>
        </button>
      </div>
    </div>
  );
}