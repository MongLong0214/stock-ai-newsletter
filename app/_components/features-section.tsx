import { motion } from "framer-motion";

interface Feature {
  title: string;
  description: string;
  gradient: string;
}

interface FeaturesSectionProps {
  animationDuration: number;
  viewportMargin: string;
  isMobile: boolean;
  features: readonly Feature[];
}

function FeaturesSection({
  animationDuration,
  viewportMargin,
  isMobile,
  features
}: FeaturesSectionProps) {
  const getDelay = (index: number) => {
    const delays = [0, 0.15, 0.3];
    const mobileDelays = [0, 0.08, 0.16];
    return isMobile ? mobileDelays[index] : delays[index];
  };

  return (
    <section className="py-20 lg:py-24 px-6 lg:px-8 relative" aria-labelledby="features-heading">
      <div className="max-w-7xl mx-auto">
        <motion.h2
          id="features-heading"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration, ease: [0.19, 1, 0.22, 1] }}
          viewport={{ once: true, margin: viewportMargin }}
          className="text-4xl sm:text-5xl md:text-6xl font-extralight mb-14 lg:mb-16 text-center text-green-400/90 tracking-tight"
        >
          3개의 LLM 모델
        </motion.h2>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {features.map((feature, index) => (
            <motion.article
              key={index}
              initial={{ opacity: 0, y: 60 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{
                duration: animationDuration,
                delay: getDelay(index),
                ease: [0.19, 1, 0.22, 1]
              }}
              viewport={{ once: true, margin: viewportMargin }}
              className="group relative"
              tabIndex={0}
              role="article"
              aria-label={`${feature.title} AI system`}
            >
              <div className="relative p-8 lg:p-10 rounded-3xl glass-morphism border border-green-500/20 transition-all duration-700 ease-out-expo group-hover:border-green-500/40 group-focus:border-green-500/40 group-hover:shadow-[0_0_40px_rgba(0,255,65,0.1)] overflow-hidden">
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-out-expo`} aria-hidden="true" />

                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-500/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[2s] ease-out-expo" aria-hidden="true" />
                </div>

                <div className="relative z-10">
                  <h3 className="text-3xl lg:text-4xl font-normal mb-4 text-green-300 tracking-tight group-hover:text-green-200 transition-colors duration-500">
                    {feature.title}
                  </h3>
                  <p className="text-sm lg:text-base text-green-200/60 font-light leading-relaxed tracking-wide group-hover:text-green-200/80 transition-colors duration-500">
                    {feature.description}
                  </p>
                </div>

                <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" style={{
                  background: 'linear-gradient(135deg, transparent 0%, rgba(0,255,65,0.1) 50%, transparent 100%)',
                  padding: '1px',
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude'
                }} aria-hidden="true" />
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default FeaturesSection;