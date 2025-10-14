import { motion } from "framer-motion";

interface PhilosophySectionProps {
  longAnimationDuration: number;
  viewportMargin: string;
}

function PhilosophySection({ longAnimationDuration, viewportMargin }: PhilosophySectionProps) {
  return (
    <section className="py-20 lg:py-28 px-6 lg:px-8 relative" aria-labelledby="philosophy-heading">
      <div className="max-w-5xl mx-auto text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: longAnimationDuration, ease: [0.19, 1, 0.22, 1] }}
          viewport={{ once: true, margin: viewportMargin }}
        >
          <h2 id="philosophy-heading" className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-extralight mb-8 lg:mb-10 text-emerald-500/80 tracking-tight leading-tight">
            오로지 <span className="font-normal text-emerald-300">숫자</span>와 <span className="font-normal text-emerald-300">차트</span>로만
          </h2>
          <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl text-slate-300 font-light leading-relaxed tracking-wide">
            감이 아닌 데이터, 추측이 아닌 신호
          </p>
        </motion.div>
      </div>
    </section>
  );
}

export default PhilosophySection;