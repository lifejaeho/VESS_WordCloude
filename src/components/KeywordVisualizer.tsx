import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { extractKeywords, KeywordResult } from '../lib/gemini';
import KeywordNode from './KeywordNode';
import { Search, Loader2, Sparkles, LayoutGrid, Type as TypeIcon, Trash2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

const KeywordVisualizer: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [keywords, setKeywords] = useState<KeywordResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [zoomScale, setZoomScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Mouse position relative to the container
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setMousePos({ x, y });

    if (isDragging) {
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      setPanOffset(prev => ({
        x: prev.x + dx,
        y: prev.y + dy
      }));
      dragStartPos.current = { x: e.clientX, y: e.clientY };
    }
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag with left click
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetPan = () => {
    setPanOffset({ x: 0, y: 0 });
    setZoomScale(1);
  };

  const handleZoom = (delta: number) => {
    setZoomScale(prev => Math.min(Math.max(0.2, prev + delta), 3));
  };

  const applyOverlapPrevention = (results: KeywordResult[]) => {
    const positioned = [...results];
    const iterations = 2000; // More iterations for better stability
    const gravityBase = 0.15; // Slightly weaker gravity to allow repulsion to work

    for (let i = 0; i < iterations; i++) {
      let moved = false;
      for (let j = 0; j < positioned.length; j++) {
        const nodeA = positioned[j];
        
        const angle = Math.atan2(nodeA.y - 50, nodeA.x - 50);
        // Stronger pull to center for high scores
        const idealRadius = Math.pow(1 - nodeA.score, 1.5) * 42;
        const currentRadius = Math.sqrt(Math.pow(nodeA.x - 50, 2) + Math.pow(nodeA.y - 50, 2));
        const radiusDiff = idealRadius - currentRadius;
        
        const pullStrength = nodeA.score > 0.7 ? gravityBase * 2 : gravityBase;
        nodeA.x += Math.cos(angle) * radiusDiff * pullStrength * 0.05;
        nodeA.y += Math.sin(angle) * radiusDiff * pullStrength * 0.05;

        for (let k = j + 1; k < positioned.length; k++) {
          const nodeB = positioned[k];
          
          const dx = nodeB.x - nodeA.x;
          const dy = nodeB.y - nodeA.y;
          
          // Improved bounding box estimation
          // rem to % conversion: 1rem is roughly 1.5-2% of container width depending on aspect ratio
          // We use a safe estimate: 1rem ~ 2.5 units in our 100x100 coordinate system
          const fontSizeA = (nodeA.score < 0.5 ? 0.55 : 0.65) + nodeA.size * 0.18;
          const fontSizeB = (nodeB.score < 0.5 ? 0.55 : 0.65) + nodeB.size * 0.18;
          
          const widthA = nodeA.word.length * (fontSizeA * 1.4); 
          const widthB = nodeB.word.length * (fontSizeB * 1.4);
          const heightA = fontSizeA * 3.5;
          const heightB = fontSizeB * 3.5;

          const minDx = (widthA + widthB) * 0.55; 
          const minDy = (heightA + heightB) * 0.55;
          
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);

          if (absDx < minDx && absDy < minDy) {
            // Overlap detected
            const overlapX = minDx - absDx;
            const overlapY = minDy - absDy;
            
            // Push away
            const moveX = (dx === 0 ? (Math.random() - 0.5) : (dx / absDx)) * overlapX * 0.8;
            const moveY = (dy === 0 ? (Math.random() - 0.5) : (dy / absDy)) * overlapY * 0.8;
            
            nodeA.x -= moveX;
            nodeA.y -= moveY;
            nodeB.x += moveX;
            nodeB.y += moveY;
            
            nodeA.x = Math.max(5, Math.min(95, nodeA.x));
            nodeA.y = Math.max(5, Math.min(95, nodeA.y));
            nodeB.x = Math.max(5, Math.min(95, nodeB.x));
            nodeB.y = Math.max(5, Math.min(95, nodeB.y));
            
            moved = true;
          }
        }
      }
      if (!moved && i > 1000) break;
    }
    return positioned;
  };

  const handleAnalyze = async () => {
    if (!inputText.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    setKeywords([]);
    
    try {
      const results = await extractKeywords(inputText);
      
      if (!results || results.length === 0) {
        throw new Error("추출된 키워드가 없습니다.");
      }
      
      const centered = results.map(k => {
        const angle = Math.random() * Math.PI * 2;
        // More aggressive radius distribution: high scores strictly in center
        const radius = Math.pow(1 - k.score, 1.5) * 45; 
        return {
          ...k,
          x: 50 + Math.cos(angle) * radius,
          y: 50 + Math.sin(angle) * radius
        };
      });

      const nonOverlapping = applyOverlapPrevention(centered);
      setKeywords(nonOverlapping);
    } catch (err) {
      const message = err instanceof Error ? err.message : "분석 중 오류가 발생했습니다.";
      setError(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClear = () => {
    setInputText('');
    setKeywords([]);
    setError(null);
  };

  const downloadAsHtml = () => {
    if (keywords.length === 0) return;

    const htmlContent = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VESS - 문제찾기 워드클라우드 결과</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
    <style>
        body {
            background-color: #0F172A;
            color: #F1F5F9;
            font-family: 'Inter', sans-serif;
            margin: 0;
            overflow: hidden;
            height: 100vh;
            width: 100vw;
            user-select: none;
        }
        #viewport {
            width: 100%;
            height: 100%;
            cursor: grab;
            overflow: hidden;
            position: relative;
        }
        #viewport:active {
            cursor: grabbing;
        }
        #canvas {
            position: absolute;
            width: 100%;
            height: 100%;
            transform-origin: center;
            transition: transform 0.1s ease-out;
        }
        .dot-bg {
            position: absolute;
            inset: -5000px;
            background-image: radial-gradient(#4F46E5 1px, transparent 1px);
            background-size: 40px 40px;
            opacity: 0.1;
            pointer-events: none;
        }
        .node {
            position: absolute;
            transform: translate(-50%, -50%);
            pointer-events: auto;
            transition: all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .node-content {
            padding: 0.375rem 0.75rem;
            white-space: nowrap;
            font-weight: 900;
            letter-spacing: -0.025em;
            transition: all 0.5s ease;
        }
        .node.expanded .node-content {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(12px);
            border-radius: 0.75rem;
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.5);
        }
        .card {
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%) translateY(10px);
            width: 20rem;
            padding: 1.25rem;
            background: #1E293B;
            border-radius: 1.5rem;
            border: 1px solid rgba(71, 85, 105, 0.5);
            box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.5);
            backdrop-filter: blur(16px);
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
            z-index: 100;
        }
        .node.expanded .card {
            opacity: 1;
            visibility: visible;
            transform: translateX(-50%) translateY(8px);
        }
        .score-bar {
            height: 0.25rem;
            background: #1E293B;
            border-radius: 9999px;
            overflow: hidden;
            border: 1px solid rgba(71, 85, 105, 0.3);
        }
        .score-fill {
            height: 100%;
            background: linear-gradient(to right, #6366F1, #A855F7);
            transition: width 1s ease-out;
        }
    </style>
</head>
<body>
    <div id="viewport">
        <div id="canvas">
            <div class="dot-bg"></div>
            <div id="nodes-container"></div>
        </div>
    </div>

    <div class="fixed top-6 left-6 flex items-center gap-3 z-50">
        <div class="text-2xl font-black tracking-tighter text-white bg-gradient-to-br from-indigo-500 to-purple-600 bg-clip-text text-transparent">VESS</div>
        <div class="h-6 w-px bg-slate-700 mx-1"></div>
        <div class="text-sm font-bold text-slate-300">문제찾기 워드클라우드 결과</div>
    </div>

    <!-- How it works Section -->
    <div class="fixed bottom-6 left-6 w-80 bg-[#1E293B]/90 backdrop-blur-md rounded-3xl p-5 border border-slate-700/50 shadow-2xl z-50">
        <h3 class="text-xs font-bold mb-3 flex items-center gap-2 text-white">
            <i data-lucide="layout-grid" class="w-3.5 h-3.5 text-indigo-400"></i>
            How it works
        </h3>
        <div class="space-y-2.5">
            <div class="flex gap-2">
                <div class="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
                <p class="text-[10px] text-slate-300 leading-snug">
                    <span class="font-bold text-white">시각적 위계:</span> <span class="text-indigo-400 font-bold">중요 키워드</span>는 화려한 색상으로 중앙에, <span class="text-white/60 font-bold">부차적 키워드</span>는 흰색 텍스트로 주변부에 배치됩니다.
                </p>
            </div>
            <div class="flex gap-2">
                <div class="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
                <p class="text-[10px] text-slate-300 leading-snug">
                    <span class="font-bold text-white">문맥(Context):</span> 단어 설명과 함께, 본 단어가 실제 텍스트에서 어떤 의미로 사용되었는지 상세한 문맥을 보여줍니다.
                </p>
            </div>
            <div class="flex gap-2">
                <div class="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
                <p class="text-[10px] text-slate-300 leading-snug">
                    <span class="font-bold text-white">조작:</span> 마우스 드래그로 이동, <span class="text-indigo-400 font-bold">휠 스크롤</span>로 확대/축소가 가능합니다.
                </p>
            </div>
        </div>
    </div>

    <div class="fixed bottom-6 right-6 text-[9px] text-slate-500 font-bold uppercase tracking-widest z-50">
        Drag to Pan • Scroll to Zoom • Hover to Explore
    </div>

    <script>
        const keywords = ${JSON.stringify(keywords)};
        const COLORS = [
            'text-rose-400', 'text-blue-400', 'text-emerald-400', 'text-orange-400',
            'text-purple-400', 'text-amber-400', 'text-cyan-400', 'text-indigo-400', 'text-slate-300'
        ];

        const viewport = document.getElementById('viewport');
        const canvas = document.getElementById('canvas');
        const container = document.getElementById('nodes-container');

        let panX = 0, panY = 0, scale = 1;
        let isDragging = false, startX = 0, startY = 0;

        // Initialize Nodes
        keywords.forEach((kw, idx) => {
            const isMinor = kw.score < 0.5;
            const colorIdx = Math.abs(kw.word.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % COLORS.length;
            const colorClass = isMinor ? 'text-white/60' : COLORS[colorIdx];
            const fontSize = (isMinor ? 0.55 : 0.65) + kw.size * 0.18;

            const node = document.createElement('div');
            node.className = 'node';
            node.style.left = kw.x + '%';
            node.style.top = kw.y + '%';
            node.dataset.score = kw.score;
            node.dataset.word = kw.word;

            node.innerHTML = \`
                <div class="node-content \${colorClass}" style="font-size: \${fontSize}rem; \${isMinor ? 'opacity: 0.4;' : ''}">
                    \${kw.word}
                </div>
                <div class="card">
                    <div class="flex items-start gap-3 mb-3">
                        <div class="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                            <i data-lucide="info" class="w-4 h-4 text-indigo-400"></i>
                        </div>
                        <div>
                            <h4 class="text-sm font-bold text-white mb-1">\${kw.word}</h4>
                            <p class="text-[11px] text-slate-400 leading-relaxed">\${kw.description}</p>
                        </div>
                    </div>
                    <div class="pt-3 border-t border-slate-700/50">
                        <div class="flex gap-2 text-slate-500 mb-1.5">
                            <i data-lucide="quote" class="w-2.5 h-2.5"></i>
                            <span class="text-[9px] uppercase tracking-wider font-bold">Problem Context</span>
                        </div>
                        <p class="text-[11px] italic text-slate-300 leading-relaxed bg-[#0F172A]/50 p-2.5 rounded-lg border border-slate-700/30">
                            "\${kw.sentence}"
                        </p>
                    </div>
                    <div class="mt-4">
                        <div class="flex items-center justify-between mb-1.5">
                            <span class="text-[9px] uppercase tracking-widest font-bold text-slate-500">Interest Score</span>
                            <span class="text-[9px] font-mono text-indigo-400 font-bold">\${(kw.score * 100).toFixed(0)}%</span>
                        </div>
                        <div class="score-bar">
                            <div class="score-fill" style="width: 0%"></div>
                        </div>
                    </div>
                </div>
            \`;
            container.appendChild(node);
        });

        lucide.createIcons();

        // Interaction Logic
        const updateTransform = () => {
            canvas.style.transform = \`translate(\${panX}px, \${panY}px) scale(\${scale})\`;
        };

        viewport.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX - panX;
            startY = e.clientY - panY;
        });

        window.addEventListener('mousemove', (e) => {
            if (isDragging) {
                panX = e.clientX - startX;
                panY = e.clientY - startY;
                updateTransform();
            }

            // Proximity Detection
            const rect = viewport.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            document.querySelectorAll('.node').forEach(node => {
                const nodeRect = node.getBoundingClientRect();
                const nodeCenterX = nodeRect.left - rect.left + nodeRect.width / 2;
                const nodeCenterY = nodeRect.top - rect.top + nodeRect.height / 2;

                const dx = mouseX - nodeCenterX;
                const dy = mouseY - nodeCenterY;
                const dist = Math.sqrt(dx * dx + dy * dy) / scale;

                if (dist < 60) {
                    if (!node.classList.contains('expanded')) {
                        node.classList.add('expanded');
                        node.style.zIndex = 1000;
                        const fill = node.querySelector('.score-fill');
                        const score = parseFloat(node.dataset.score);
                        setTimeout(() => fill.style.width = (score * 100) + '%', 50);
                    }
                } else {
                    if (node.classList.contains('expanded')) {
                        node.classList.remove('expanded');
                        node.style.zIndex = Math.floor(parseFloat(node.dataset.score) * 10);
                        node.querySelector('.score-fill').style.width = '0%';
                    }
                }

                // Dynamic scaling/opacity
                const s = Math.max(1, 1.8 - dist / 300);
                const o = Math.max(0.2, 1 - dist / 800);
                const content = node.querySelector('.node-content');
                if (!node.classList.contains('expanded')) {
                    content.style.transform = \`scale(\${s})\`;
                    content.style.opacity = o;
                } else {
                    content.style.transform = \`scale(1.05)\`;
                    content.style.opacity = 1;
                }
            });
        });

        window.addEventListener('mouseup', () => isDragging = false);

        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            scale = Math.min(Math.max(0.2, scale + delta), 3);
            updateTransform();
        }, { passive: false });

    </script>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vess_interactive_${new Date().getTime()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-[#1E293B]/80 backdrop-blur-md border-b border-slate-700/50 z-50 px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <div className="text-2xl font-black tracking-tighter text-white bg-gradient-to-br from-indigo-500 to-purple-600 bg-clip-text text-transparent">
              VESS
            </div>
          </div>
          <div className="h-6 w-px bg-slate-700 mx-2" />
          <h2 className="text-sm font-bold tracking-tight text-slate-300">
            12기 <span className="text-indigo-400">문제찾기 워드클라우드</span>
          </h2>
        </div>
        
        <div className="flex items-center gap-4">
          {keywords.length > 0 && (
            <button 
              onClick={downloadAsHtml}
              className="px-4 py-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-2"
            >
              <Maximize2 className="w-4 h-4" />
              HTML로 저장하기
            </button>
          )}
          <button 
            onClick={handleClear}
            className="p-2 text-slate-400 hover:text-red-400 transition-colors"
            title="Clear all"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="pt-24 pb-12 px-6 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-6rem)]">
        {/* Input Section */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <div className="bg-[#1E293B] rounded-3xl p-6 shadow-xl border border-slate-700/50 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4 text-slate-400">
              <div className="flex items-center gap-2">
                <TypeIcon className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Input Text</span>
              </div>
              <button 
                onClick={() => setInputText('최근 생성형 AI의 비약적인 발전은 우리 사회 전반에 걸쳐 디지털 리터러시의 중요성을 다시금 일깨워주고 있습니다. 특히 정보의 진위 여부를 판단하는 교차 검증 능력은 인공지능이 만들어내는 환각 현상을 방지하는 데 필수적인 요소가 되었습니다. 학생들은 단순히 기술을 사용하는 것을 넘어, 그 이면에 숨겨진 알고리즘의 원리를 이해하고 비판적으로 사고하는 태도를 길러야 합니다. 이러한 역량은 미래 사회에서 개인의 경쟁력을 결정짓는 핵심적인 지표가 될 것입니다.')}
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Sample Text
              </button>
            </div>
            
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="분석할 문단이나 에세이를 입력하세요..."
              className={`flex-1 w-full bg-[#0F172A] rounded-2xl p-4 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-all resize-none leading-relaxed border border-slate-700/50 ${error ? 'ring-2 ring-red-500/20 border-red-500/50' : 'focus:ring-indigo-500/20'}`}
            />

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 p-3 bg-red-500/10 rounded-xl border border-red-500/20"
              >
                <p className="text-xs text-red-400 font-medium leading-relaxed">
                  {error}
                </p>
                <button 
                  onClick={handleAnalyze}
                  className="mt-2 text-[10px] font-bold text-red-400 hover:underline flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  다시 시도하기
                </button>
              </motion.div>
            )}

            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !inputText.trim()}
              className={`
                mt-6 w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all
                ${isAnalyzing 
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 active:scale-[0.98]'}
              `}
            >
              {isAnalyzing ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>심층 분석 중...</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] text-indigo-300 animate-pulse">
                      최대 80개의 키워드를 정밀 추출하고 있습니다.
                    </span>
                    <span className="text-[9px] text-slate-500">
                      (텍스트 길이에 따라 1~2분 정도 소요될 수 있습니다)
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  <span>키워드 추출하기</span>
                </>
              )}
            </button>
          </div>

          <div className="bg-[#1E293B] rounded-3xl p-6 text-slate-200 shadow-xl border border-slate-700/50">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-white">
              <LayoutGrid className="w-4 h-4 text-indigo-400" />
              How it works
            </h3>
            <div className="space-y-3">
              <p className="text-xs text-slate-400 leading-relaxed">
                단순 빈도 분석이 아닌, 문맥을 파악하여 작성자의 실제 관심사를 추출합니다. 
              </p>
              <div className="space-y-2 pt-2 border-t border-slate-700/50">
                <div className="flex gap-2">
                  <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                  <p className="text-[11px] text-slate-300 leading-snug">
                    <span className="font-bold text-white">시각적 위계:</span> <span className="text-indigo-400 font-bold">중요 키워드</span>는 화려한 색상으로 중앙에, <span className="text-white/60 font-bold">부차적 키워드</span>는 흰색 텍스트로 주변부에 배치됩니다.
                  </p>
                </div>
                <div className="flex gap-2">
                  <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                  <p className="text-[11px] text-slate-300 leading-snug">
                    <span className="font-bold text-white">문맥(Context):</span> 단어 설명과 함께, 본 단어가 실제 텍스트에서 어떤 의미로 사용되었는지 상세한 문맥을 보여줍니다.
                  </p>
                </div>
                <div className="flex gap-2">
                  <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                  <p className="text-[11px] text-slate-300 leading-snug">
                    <span className="font-bold text-white">조작:</span> 마우스 드래그로 이동, <span className="text-indigo-400 font-bold">+, - 버튼</span>으로 확대/축소가 가능합니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Visualization Section */}
        <div className="lg:col-span-9 relative bg-[#0F172A] rounded-[2.5rem] shadow-2xl border border-slate-700/50 overflow-hidden group">
          <div 
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`w-full h-full relative ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          >
            {/* Pannable Content */}
            <div 
              className="absolute inset-0 w-full h-full transition-transform duration-75 ease-out pointer-events-none origin-center"
              style={{ 
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                backgroundImage: 'radial-gradient(#4F46E5 1px, transparent 1px)', 
                backgroundSize: '40px 40px',
                opacity: 0.1
              }} 
            />

            <div 
              className="absolute inset-0 w-full h-full origin-center"
              style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})` }}
            >
              {keywords.length > 0 ? (
                <div key="results-wrapper" className="w-full h-full relative">
                  {keywords.map((kw, idx) => (
                    <KeywordNode 
                      key={`${kw.word}-${idx}-${keywords.length}`} 
                      keyword={kw} 
                      mousePos={mousePos}
                      panOffset={panOffset}
                      zoomScale={zoomScale}
                      containerRef={containerRef}
                    />
                  ))}
                </div>
              ) : !isAnalyzing && (
                <div key="empty-wrapper" className="absolute inset-0 flex flex-col items-center justify-center text-slate-500" style={{ transform: `translate(${-panOffset.x}px, ${-panOffset.y}px) scale(${1/zoomScale})` }}>
                  <div className="w-20 h-20 border-2 border-dashed border-slate-700 rounded-full flex items-center justify-center mb-4">
                    <Search className="w-8 h-8" />
                  </div>
                  <p className="text-sm font-medium">분석 결과가 여기에 표시됩니다</p>
                </div>
              )}
            </div>

            {/* Controls Overlay */}
            <div className="absolute bottom-6 right-6 flex flex-col gap-2">
              <div className="flex bg-[#1E293B]/90 backdrop-blur-md border border-slate-700/50 rounded-2xl p-1 shadow-2xl">
                <button 
                  onClick={() => handleZoom(0.1)}
                  className="p-2 text-slate-300 hover:text-white transition-colors hover:bg-slate-700 rounded-xl"
                  title="Zoom In"
                >
                  <ZoomIn className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => handleZoom(-0.1)}
                  className="p-2 text-slate-300 hover:text-white transition-colors hover:bg-slate-700 rounded-xl"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-5 h-5" />
                </button>
                <div className="w-px bg-slate-700 mx-1" />
                <button 
                  onClick={resetPan}
                  className="p-2 text-slate-300 hover:text-white transition-colors hover:bg-slate-700 rounded-xl"
                  title="Reset View"
                >
                  <Maximize2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Mouse Guide */}
            <div 
              className="absolute w-40 h-40 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none transition-transform duration-75 ease-out"
              style={{ 
                transform: `translate(${mousePos.x - (containerRef.current?.getBoundingClientRect().left || 0) - 80}px, ${mousePos.y - (containerRef.current?.getBoundingClientRect().top || 0) - 80}px)` 
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default KeywordVisualizer;
