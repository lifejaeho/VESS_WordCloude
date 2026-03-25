import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { KeywordResult } from '../lib/gemini';
import { Info, Quote } from 'lucide-react';

interface KeywordNodeProps {
  keyword: KeywordResult;
  mousePos: { x: number; y: number };
  panOffset: { x: number; y: number };
  zoomScale: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const COLORS = [
  'text-rose-400',
  'text-blue-400',
  'text-emerald-400',
  'text-orange-400',
  'text-purple-400',
  'text-amber-400',
  'text-cyan-400',
  'text-indigo-400',
  'text-slate-300'
];

const KeywordNode: React.FC<KeywordNodeProps> = ({ keyword, mousePos, panOffset, zoomScale, containerRef }) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState(1000);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Pick a stable color based on the word, but use white if score is low
  const isMinor = keyword.score < 0.5;
  const colorClass = isMinor 
    ? 'text-white/60' 
    : COLORS[Math.abs(keyword.word.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % COLORS.length];

  useEffect(() => {
    if (!nodeRef.current || !containerRef.current) return;

    const rect = nodeRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    
    const nodeCenterX = rect.left - containerRect.left + rect.width / 2;
    const nodeCenterY = rect.top - containerRect.top + rect.height / 2;

    const dx = mousePos.x - nodeCenterX;
    const dy = mousePos.y - nodeCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy) / zoomScale;
    
    setDistance(dist);
    
    if (dist < 60) {
      setIsExpanded(true);
    } else {
      setIsExpanded(false);
    }
  }, [mousePos, zoomScale]);

  // Proximity effects
  const baseOpacity = isMinor ? 0.2 : 0.6;
  const scale = Math.max(1, 1.8 - distance / 300);
  const opacity = Math.max(baseOpacity, 1 - distance / 800);
  const brightness = Math.min(1.4, 0.9 + (1 / (distance / 200 + 1)));

  return (
    <div
      ref={nodeRef}
      className="absolute transition-all duration-700 ease-out pointer-events-none"
      style={{
        left: `${keyword.x}%`,
        top: `${keyword.y}%`,
        zIndex: isExpanded ? 50 : Math.floor(keyword.score * 10),
      }}
    >
      <motion.div
        animate={{
          scale: isExpanded ? 1.05 : scale,
          opacity: opacity,
          filter: `brightness(${brightness})`,
        }}
        className="relative flex items-center justify-center"
      >
        {/* The Keyword Label - Simplified for Word Cloud look */}
        <div 
          className={`
            px-3 py-1.5 whitespace-nowrap font-black tracking-tight transition-all duration-500
            ${isExpanded 
              ? 'bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-2xl' 
              : 'bg-transparent'}
            ${colorClass}
          `}
          style={{ 
            fontSize: `${(isMinor ? 0.55 : 0.65) + keyword.size * 0.18}rem`, 
            textShadow: isExpanded ? '0 0 20px rgba(255,255,255,0.2)' : (isMinor ? '0 1px 3px rgba(0,0,0,0.8)' : '0 1px 2px rgba(0,0,0,0.5)')
          }}
        >
          {keyword.word}
        </div>

        {/* Expanded Card */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              className="absolute top-full mt-2 w-80 p-5 bg-[#1E293B] rounded-[1.5rem] shadow-2xl border border-slate-700/50 pointer-events-auto z-50 backdrop-blur-xl"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                  <Info className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">{keyword.word}</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {keyword.description}
                  </p>
                </div>
              </div>
              
              <div className="pt-3 border-t border-slate-700/50">
                <div className="flex gap-2 text-slate-500 mb-1.5">
                  <Quote className="w-2.5 h-2.5" />
                  <span className="text-[9px] uppercase tracking-wider font-bold">Problem Context</span>
                </div>
                <p className="text-[11px] italic text-slate-300 leading-relaxed bg-[#0F172A]/50 p-2.5 rounded-lg border border-slate-700/30">
                  "{keyword.sentence}"
                </p>
              </div>

              {/* Score Indicator */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] uppercase tracking-widest font-bold text-slate-500">Interest Score</span>
                  <span className="text-[9px] font-mono text-indigo-400 font-bold">
                    {(keyword.score * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden border border-slate-700/30">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${keyword.score * 100}%` }}
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default KeywordNode;
