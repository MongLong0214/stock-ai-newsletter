'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface Column {
  id: number;
  x: number;
  chars: string[];
  speed: number;
  delay: number;
  opacity: number;
}

// Rust-only dystopian code snippets
const codeSnippets = [
  // Rust keywords
  'fn', 'let', 'mut', 'const', 'static', 'unsafe', 'impl', 'trait',
  'struct', 'enum', 'match', 'if', 'else', 'loop', 'while', 'for',
  'break', 'continue', 'return', 'mod', 'pub', 'use', 'crate',
  'self', 'Self', 'super', 'async', 'await', 'move', 'ref',
  // Rust types
  'i8', 'i16', 'i32', 'i64', 'i128', 'u8', 'u16', 'u32', 'u64', 'u128',
  'f32', 'f64', 'bool', 'char', 'str', 'String', 'Vec', 'Option',
  'Result', 'Box', 'Rc', 'Arc', 'Cell', 'RefCell',
  // Rust operators
  '->', '=>', '::', '&', '&&', '||', '!', '?', '|', '@',
  '..', '...', '<', '>', '<=', '>=', '==', '!=',
  // Rust macros
  'println!', 'vec!', 'panic!', 'assert!', 'debug!', 'format!',
  'macro_rules!', 'derive', 'cfg', 'test',
  // Ownership/lifetime
  '&mut', '&str', '<\'a>', '\'static', 'Drop', 'Clone', 'Copy',
  // Random hex/binary
  '0x', '0b', '0o', 'xFF', '0xDEAD', '0xBEEF', '0x00', '0xFF41',
  // Single chars/symbols
  '{', '}', '[', ']', '(', ')', ';', ':', ',', '.',
  '/', '\\', '*', '+', '-', '=', '_', '|', '^', '~',
  // Numbers
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '00', '11', 'FF', 'A5', '3F', '7E', 'C0', 'DE',
  // Cryptic fragments
  'Err', 'Ok', 'Some', 'None', 'unwrap', 'expect',
  'as', 'dyn', 'where', 'type', 'async', 'const',
  // Japanese katakana (dystopian Matrix aesthetic)
  'ｦ', 'ｱ', 'ｳ', 'ｴ', 'ｵ', 'ｶ', 'ｷ', 'ｸ', 'ｹ', 'ｺ',
  'ｻ', 'ｼ', 'ｽ', 'ｾ', 'ｿ', 'ﾀ', 'ﾁ', 'ﾂ', 'ﾃ', 'ﾄ',
];

const generateColumns = () => {
  const newColumns: Column[] = [];
  const columnCount = 50; // Reduced for less overlap and smoother animation

  for (let i = 0; i < columnCount; i++) {
    const columnChars = [];
    const charCount = Math.floor(Math.random() * 15) + 8; // 8-23 characters per column (reduced)

    for (let j = 0; j < charCount; j++) {
      columnChars.push(codeSnippets[Math.floor(Math.random() * codeSnippets.length)]);
    }

    newColumns.push({
      id: i,
      x: (i / columnCount) * 100,
      chars: columnChars,
      speed: 5 + Math.random() * 7, // 5-12 seconds (1.7x faster than original 8-20s)
      delay: Math.random() * 0.5, // Quick start within 0.5 seconds
      opacity: 0.12 + Math.random() * 0.10, // Enhanced opacity (0.12-0.22) for better visibility
    });
  }

  return newColumns;
};

function AnimatedBackground() {
  const [mounted, setMounted] = useState(false);
  const [columns, setColumns] = useState<Column[]>([]);

  useEffect(() => {
    setMounted(true);
    setColumns(generateColumns());
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 bg-black">
      {/* Primary matrix columns */}
      {columns.map((column) => (
        <motion.div
          key={column.id}
          className="absolute top-0 flex flex-col"
          style={{
            left: `${column.x}%`,
            opacity: column.opacity,
          }}
          initial={{ y: '-150%' }}
          animate={{
            y: '120vh',
          }}
          transition={{
            duration: column.speed,
            delay: column.delay,
            repeat: Infinity,
            ease: 'linear',
            repeatDelay: 0,
            repeatType: 'loop',
          }}
        >
          {column.chars.map((char, index) => {
            const isLast = index === column.chars.length - 1;
            const isFront = index < 3; // First 3 characters are brightest
            const position = index / column.chars.length;

            return (
              <div
                key={`${column.id}-${index}`}
                className="font-mono select-none leading-tight"
                style={{
                  fontSize: isFront ? '22px' : '20px',
                  color: isFront
                    ? '#ffffff' // Pure white for front characters
                    : isLast
                    ? 'rgba(0, 255, 65, 0.2)' // Faint tail
                    : `rgba(0, 255, 65, ${1 - position * 0.85})`, // Gradient fade
                  textShadow: isFront
                    ? '0 0 12px rgba(0, 255, 65, 1), 0 0 24px rgba(0, 255, 65, 0.6)'
                    : index === 0
                    ? '0 0 8px rgba(0, 255, 65, 0.8)'
                    : 'none',
                  fontWeight: isFront ? '600' : '400',
                  filter: isFront ? 'brightness(1.2)' : 'none',
                }}
              >
                {char}
              </div>
            );
          })}
        </motion.div>
      ))}

      {/* Gradient overlay for depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at center top, transparent 0%, rgba(0, 0, 0, 0.4) 50%, rgba(0, 0, 0, 0.8) 100%),
            radial-gradient(ellipse at center, rgba(0, 255, 65, 0.08) 0%, transparent 60%)
          `,
        }}
        aria-hidden="true"
      />

      {/* Vignette effect */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at center, transparent 20%, rgba(0, 0, 0, 0.6) 100%)
          `,
        }}
        aria-hidden="true"
      />

      {/* Horizontal scan lines for CRT effect */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 65, 0.1) 2px, rgba(0, 255, 65, 0.1) 4px)',
        }}
        aria-hidden="true"
      />
    </div>
  );
}

export default AnimatedBackground;