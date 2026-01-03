
import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, Loader2, AlertTriangle, Scan, Zap } from 'lucide-react';

interface ScannerModalProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({ onScan, onClose }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader-logistic-v2";
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Sistema de Beep Robusto usando Web Audio API
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime); // Tom mais agudo para ambientes ruidosos
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) {
      console.warn("Falha no áudio:", e);
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
        console.warn("Cleanup error:", e);
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
        await scannerRef.current.applyVideoConstraints({
          // @ts-ignore
          advanced: [{ torch: state }]
        });
        setTorchOn(state);
      } catch (e) {
        console.warn("Lanterna não suportada");
      }
    }
  };

  useEffect(() => {
    let isMounted = true;

    const startScanner = async () => {
      // Pequeno delay para garantir que o DOM ID exista
      await new Promise(resolve => setTimeout(resolve, 400));
      if (!isMounted) return;

      try {
        if (scannerRef.current) {
          try {
            if (scannerRef.current.isScanning) await scannerRef.current.stop();
            await scannerRef.current.clear();
          } catch (e) { /* ignore cleanup errors */ }
        }
        
        scannerRef.current = new Html5Qrcode(containerId);

        const config = { 
          fps: 30, // Mais FPS = Detecção mais rápida
          qrbox: (viewWidth: number, viewHeight: number) => {
            const minSize = Math.min(viewWidth, viewHeight);
            const size = Math.floor(minSize * 0.7);
            return { width: size, height: size };
          },
          aspectRatio: 1.0,
        };

        const onScanSuccess = (decodedText: string) => {
          if (isMounted && !isProcessing) {
            setIsProcessing(true);
            playBeep();

            // Feedback Visual de Sucesso
            const container = document.getElementById(containerId);
            if (container) {
              container.style.filter = 'invert(1) brightness(2)';
              setTimeout(() => { if(container) container.style.filter = 'none'; }, 150);
            }
            
            // Finaliza após o feedback
            setTimeout(() => {
              if (isMounted) onScan(decodedText);
            }, 250);
          }
        };

        // Estratégia de inicialização robusta:
        // 1. Tenta usar facingMode diretamente (funciona melhor em mobile sem labels de câmera)
        // 2. Se falhar, busca câmeras disponíveis e tenta a primeira da lista
        try {
          await scannerRef.current.start(
            { facingMode: "environment" }, 
            config, 
            onScanSuccess, 
            () => {}
          );
        } catch (e) {
          console.warn("Falha ao iniciar com facingMode: environment, tentando fallback...", e);
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            // Se houver câmeras, tenta a última (geralmente a traseira em muitos dispositivos)
            const cameraId = devices[devices.length - 1].id;
            await scannerRef.current.start(
              cameraId, 
              config, 
              onScanSuccess, 
              () => {}
            );
          } else {
            throw new Error("Nenhuma câmera encontrada no dispositivo.");
          }
        }
        
        if (isMounted) setIsInitializing(false);

      } catch (err: any) {
        console.error("Scanner V2 Error:", err);
        if (isMounted) {
          setErrorMsg(err.message || "Erro ao acessar a câmera. Verifique as permissões.");
          setIsInitializing(false);
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(() => {});
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-black z-[9999] flex flex-col overflow-hidden animate-in fade-in duration-500">
      
      {/* HEADER DO SCANNER */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-[100] bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-[0_0_20px_rgba(79,70,229,0.5)] animate-pulse">
            <Scan size={24} />
          </div>
          <div className="flex flex-col">
            <span className="text-white font-black text-sm uppercase tracking-widest italic">Lente de Fluxo</span>
            <span className="text-indigo-400 text-[10px] font-bold uppercase tracking-tighter">Detecção em tempo real ativa</span>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={toggleTorch}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all border ${torchOn ? 'bg-amber-500 text-white border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'}`}
          >
            <Zap size={20} fill={torchOn ? "currentColor" : "none"} />
          </button>
          <button 
            onClick={stopAndClose} 
            className="w-12 h-12 bg-rose-600/20 hover:bg-rose-600/40 backdrop-blur-xl border border-rose-500/30 rounded-2xl flex items-center justify-center text-rose-500 transition-all shadow-xl active:scale-90"
          >
            <X size={24} strokeWidth={3} />
          </button>
        </div>
      </div>

      <div className="relative flex-1 bg-black flex items-center justify-center">
        {/* Container HTML5-QRCode */}
        <div id={containerId} className="w-full h-full [&_video]:object-cover"></div>

        {/* MOLDURA DE LOGÍSTICA */}
        {!isInitializing && !errorMsg && (
          <div className="absolute inset-0 pointer-events-none z-20 flex flex-col items-center justify-center">
            <div className="relative w-[75vw] h-[75vw] max-w-[320px] max-h-[320px]">
              {/* Sombras externas para focar o centro */}
              <div className="absolute inset-[-1000px] shadow-[0_0_0_1000px_rgba(0,0,0,0.7)] rounded-[2.5rem]"></div>
              
              {/* Cantoneiras HUD */}
              <div className="absolute top-0 left-0 w-14 h-14 border-t-4 border-l-4 border-indigo-500 rounded-tl-[2rem]"></div>
              <div className="absolute top-0 right-0 w-14 h-14 border-t-4 border-r-4 border-indigo-500 rounded-tr-[2rem]"></div>
              <div className="absolute bottom-0 left-0 w-14 h-14 border-b-4 border-l-4 border-indigo-500 rounded-bl-[2rem]"></div>
              <div className="absolute bottom-0 right-0 w-14 h-14 border-b-4 border-r-4 border-indigo-500 rounded-br-[2rem]"></div>
              
              {/* Linha de Scan Ativa */}
              <div className="w-full h-1 bg-indigo-400 shadow-[0_0_20px_rgba(79,70,229,1)] absolute top-0 animate-[logistic-scan_3s_infinite] opacity-60"></div>
            </div>
            
            <div className="mt-16 px-8 py-4 bg-indigo-600/20 backdrop-blur-xl rounded-[2rem] border border-indigo-500/30 flex flex-col items-center shadow-2xl">
              <p className="text-white font-black uppercase italic tracking-[0.25em] text-[10px] text-center mb-1">Aguardando QR Endereço</p>
              <span className="text-indigo-300 text-[8px] font-bold uppercase tracking-widest opacity-60">Padrão: PP-R-P-X-L-X</span>
            </div>
          </div>
        )}

        {/* LOADING STATE */}
        {isInitializing && (
          <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-6 z-[90]">
            <div className="w-24 h-24 relative flex items-center justify-center">
              <div className="absolute inset-0 border-4 border-indigo-500/10 rounded-full"></div>
              <div className="absolute inset-0 border-t-4 border-indigo-500 rounded-full animate-spin"></div>
              <Camera className="text-indigo-500 animate-pulse" size={32} />
            </div>
            <div className="flex flex-col items-center">
              <span className="text-white font-black uppercase text-[12px] tracking-[0.4em] mb-2">Sincronizando Lente</span>
              <span className="text-white/20 text-[9px] font-bold uppercase tracking-widest">Iniciando hardware de captura...</span>
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {errorMsg && (
          <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center p-10 text-center z-[95]">
            <div className="bg-rose-500/5 p-12 rounded-[4rem] border-2 border-rose-500/20 max-w-sm flex flex-col items-center shadow-2xl">
              <div className="w-20 h-20 bg-rose-500/10 rounded-3xl flex items-center justify-center text-rose-500 mb-8">
                <AlertTriangle size={40} />
              </div>
              <h4 className="font-black text-white uppercase italic text-xl mb-4 tracking-tighter">Hardware Bloqueado</h4>
              <p className="text-rose-200/50 font-bold text-[11px] uppercase leading-relaxed mb-10 tracking-wide px-4">
                {errorMsg}
              </p>
              <button 
                onClick={stopAndClose} 
                className="w-full bg-rose-600 hover:bg-rose-700 text-white py-6 rounded-[2rem] font-black text-xs uppercase shadow-[0_10px_30px_rgba(225,29,72,0.3)] transition-all active:scale-95"
              >
                Voltar ao Painel
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes logistic-scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        #qr-reader-logistic-v2__dashboard { display: none !important; }
        #qr-reader-logistic-v2 video { 
          width: 100% !important; 
          height: 100% !important; 
          object-fit: cover !important;
          transition: filter 0.2s ease;
        }
        #qr-reader-logistic-v2 { border: none !important; background: transparent !important; }
      `}</style>
    </div>
  );
};
