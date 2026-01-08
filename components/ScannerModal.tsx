
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, Loader2, AlertTriangle, Scan, Zap } from 'lucide-react';

interface ScannerModalProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({ onScan, onClose }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader-logistic-v2";
  
  // Refs para manter estado estável dentro do callback do scanner sem reiniciar o useEffect
  const onScanRef = useRef(onScan);
  const isProcessingRef = useRef(false);
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [torchOn, setTorchOn] = useState(false);

  // Atualiza a referência da função onScan sempre que ela mudar no pai
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime); 
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.25);
    } catch (e) {
      console.warn("Audio feedback error:", e);
    }
  };

  const stopAndClose = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (e) {
        console.warn("Cleanup warning:", e);
      } finally {
        scannerRef.current = null;
      }
    }
    onClose();
  };

  const toggleTorch = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        const state = !torchOn;
        // @ts-ignore
        const capabilities = scannerRef.current.getRunningTrackCapabilities();
        // @ts-ignore
        if (capabilities && capabilities.torch) {
             await scannerRef.current.applyVideoConstraints({
              // @ts-ignore
              advanced: [{ torch: state }]
            });
            setTorchOn(state);
        }
      } catch (e) {
        console.warn("Torch error", e);
      }
    }
  };

  useEffect(() => {
    let isMounted = true;
    const elementId = containerId;

    const startScanner = async () => {
      // Check for camera support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
         if(isMounted) {
            setErrorMsg("Acesso à câmera não suportado neste navegador/contexto (HTTPS requerido).");
            setIsInitializing(false);
         }
         return;
      }

      // Pequeno delay para garantir que o elemento DOM exista
      await new Promise(resolve => setTimeout(resolve, 300));
      if (!isMounted) return;

      try {
        // Limpeza preventiva
        if (scannerRef.current) {
          try {
             if(scannerRef.current.isScanning) await scannerRef.current.stop();
             await scannerRef.current.clear();
          } catch(e) {}
        }

        const html5QrCode = new Html5Qrcode(elementId);
        scannerRef.current = html5QrCode;

        const config = { 
          fps: 15, 
          qrbox: (viewWidth: number, viewHeight: number) => {
            const minSize = Math.min(viewWidth, viewHeight);
            // Minimum size of 'config.qrbox' dimension value must be 50px.
            const size = Math.max(50, Math.floor(minSize * 0.7));
            return { width: size, height: size };
          },
          aspectRatio: 1.0,
          disableFlip: false
        };

        const onScanSuccess = (decodedText: string) => {
          if (isMounted && !isProcessingRef.current) {
            isProcessingRef.current = true;
            playBeep();

            // Feedback Visual
            const videoEl = document.querySelector(`#${elementId} video`) as HTMLElement | null;
            if (videoEl) {
              videoEl.style.transition = 'filter 0.1s';
              videoEl.style.filter = 'brightness(2.5) contrast(1.5)';
            }
            
            setTimeout(() => {
              if (isMounted) {
                onScanRef.current(decodedText);
              }
            }, 300);
          }
        };

        // Simplified Initialization Strategy
        try {
           await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, undefined);
        } catch (err1) {
           console.warn("Environment camera failed, trying default.", err1);
           try {
             await html5QrCode.start({ facingMode: "user" }, config, onScanSuccess, undefined);
           } catch (err2) {
             console.error("All camera attempts failed", err2);
             throw new Error("Não foi possível iniciar a câmera. Verifique permissões.");
           }
        }
        
        if (isMounted) setIsInitializing(false);

      } catch (err: any) {
        console.error("Erro Fatal Scanner:", err);
        if (isMounted) {
          setErrorMsg("Câmera indisponível. Verifique permissões ou use HTTPS.");
          setIsInitializing(false);
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (scannerRef.current) {
          scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(() => {});
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black z-[9999] flex flex-col overflow-hidden animate-in fade-in duration-300">
      
      {/* HEADER */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-[100] bg-gradient-to-b from-black/90 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg animate-pulse">
            <Scan size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-white font-black text-xs uppercase tracking-widest italic">Leitor Ativo</span>
            <span className="text-white/50 text-[9px] font-bold uppercase">Aponte para o QR</span>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={toggleTorch}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all border ${torchOn ? 'bg-amber-500 text-white border-amber-400' : 'bg-white/10 text-white border-white/20'}`}
          >
            <Zap size={20} fill={torchOn ? "currentColor" : "none"} />
          </button>
          <button 
            onClick={stopAndClose} 
            className="w-12 h-12 bg-rose-600/20 backdrop-blur-md border border-rose-500/30 rounded-2xl flex items-center justify-center text-rose-500 active:scale-95"
          >
            <X size={24} strokeWidth={3} />
          </button>
        </div>
      </div>

      <div className="relative flex-1 bg-black flex items-center justify-center">
        <div id={containerId} className="w-full h-full [&_video]:object-cover"></div>

        {/* HUD DE LEITURA */}
        {!isInitializing && !errorMsg && !isProcessingRef.current && (
          <div className="absolute inset-0 pointer-events-none z-20 flex flex-col items-center justify-center">
            <div className="relative w-[70vw] h-[70vw] max-w-[280px] max-h-[280px]">
              <div className="absolute inset-[-1000px] bg-black/50 [mask-image:radial-gradient(transparent_30%,black_70%)]"></div>
              
              {/* Cantos */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-indigo-500 rounded-tl-xl"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-indigo-500 rounded-tr-xl"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-indigo-500 rounded-bl-xl"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-indigo-500 rounded-br-xl"></div>
              
              {/* Laser */}
              <div className="w-full h-0.5 bg-indigo-400 shadow-[0_0_15px_rgba(99,102,241,1)] absolute top-1/2 -translate-y-1/2 animate-[pulse_2s_infinite]"></div>
            </div>
            
            <div className="mt-12 bg-black/60 backdrop-blur-md px-6 py-2 rounded-full border border-white/10">
              <span className="text-white text-[10px] font-black uppercase tracking-widest">Aguardando Código</span>
            </div>
          </div>
        )}

        {isProcessingRef.current && (
           <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
             <Loader2 className="w-16 h-16 text-indigo-500 animate-spin" />
           </div>
        )}

        {isInitializing && (
          <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center z-50">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
            <span className="text-white/50 text-[10px] uppercase tracking-widest font-black">Iniciando Câmera...</span>
          </div>
        )}

        {errorMsg && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900 p-8">
            <div className="text-center">
              <AlertTriangle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
              <p className="text-white font-bold mb-6">{errorMsg}</p>
              <button onClick={stopAndClose} className="bg-rose-600 text-white px-8 py-3 rounded-xl font-black uppercase text-xs">Fechar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
