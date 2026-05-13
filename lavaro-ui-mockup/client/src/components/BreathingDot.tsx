import { motion } from 'framer-motion';

interface BreathingDotProps {
  color?: string;
  size?: number;
  className?: string;
}

export function BreathingDot({ color = '#22c55e', size = 8, className = '' }: BreathingDotProps) {
  return (
    <motion.div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
      }}
      animate={{ opacity: [0.6, 1, 0.6] }}
      transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}
