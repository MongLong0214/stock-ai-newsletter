import { motion } from 'framer-motion'
import ThemeCard from '@/components/tli/theme-card'
import { STAGE_CONFIG, type ThemeListItem, type Stage } from '@/lib/tli/types'

interface StageSectionProps {
  stage: Stage
  title: string
  subtitle: string
  themes: ThemeListItem[]
  index: number
}

/** 단계별 테마 섹션 컴포넌트 */
function StageSection({ stage, title, subtitle, themes, index }: StageSectionProps) {
  const config = STAGE_CONFIG[stage]

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="mb-12"
    >
      <div className="flex items-center gap-3 mb-6">
        <div
          className="h-6 w-1 rounded-full"
          style={{ backgroundColor: config.color }}
        />
        <div>
          <h2 className="text-xl font-bold" style={{ color: config.color }}>
            {title}
            <span className="ml-2 text-sm font-normal text-slate-500">
              ({themes.length})
            </span>
          </h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {themes.map((theme: ThemeListItem) => (
          <ThemeCard key={theme.id} theme={theme} />
        ))}
      </div>
    </motion.section>
  )
}

export default StageSection
