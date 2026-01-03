
import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, Loader2, AlertTriangle } from 'lucide-react';

interface ScannerModalProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({ onScan, onClose }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader-full-resilient";
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Função centralizada de fechamento seguro
  const stopAndClose = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (e) {
        console.warn("Aviso ao liberar hardware da câmera:", e);
      } finally {
        scannerRef.current = null;
      }
    }
    onClose();
  };

  useEffect(() => {
    let isMounted = true;

    const startScanner = async () => {
      // Delay tático para garantir montagem do DOM
      await new Promise(resolve => setTimeout(resolve, 200));
      
      if (!isMounted) return;
      setIsInitializing(true);
      setErrorMsg(null);
      
      try {
        if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode(containerId);
        }

        const config = { 
          fps: 30, // Máxima fluidez para leitura instantânea
          qrbox: { width: 280, height: 280 },
          aspectRatio: 1.0
        };

        const onScanSuccess = (decodedText: string) => {
          if (isMounted && !isProcessing) {
            setIsProcessing(true);
            // Feedback visual imediato (flash branco)
            // Fix: Cast videoEl to HTMLElement to access style property which is not available on Element
            const videoEl = document.querySelector(`#${containerId} video`) as HTMLElement | null;
            if (videoEl) videoEl.style.filter = 'brightness(2) contrast(0.5)';
            
            // Pequeno delay para o usuário ver o feedback antes de fechar
            setTimeout(() => {
              onScan(decodedText);
            }, 150);
          }
        };

        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          // Prioridade para câmera traseira/grande angular (comum em logística)
          const backCamera = devices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('rear') ||
            d.label.toLowerCase().includes('traseira') ||
            d.label.toLowerCase().includes('0')
          );
          const cameraId = backCamera ? backCamera.id : devices[devices.length - 1].id;
          await scannerRef.current.start(cameraId, config, onScanSuccess, () => {});
        } else {
          await scannerRef.current.start({ facingMode: "environment" }, config, onScanSuccess, () => {});
        }
        
        if (isMounted) setIsInitializing(false);

      } catch (err: any) {
        if (isMounted) {
          setErrorMsg("Não foi possível acessar a câmera. Verifique as permissões do navegador.");
          setIsInitializing(false);
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      // Cleanup automático se o componente for destruído pelo React
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(() => {});
      }
    };
  }, [onScan, isProcessing]);

  return (
    <div className="fixed inset-0 bg-black z-[9999] flex flex-col overflow-hidden animate-in fade-in duration-300">
      
      {/* BOTÃO FECHAR - ACESSO IMEDIATO PARA EVITAR TRAVAMENTOS */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-end z-[100] bg-gradient-to-b from-black/80 to-transparent">
        <button 
          onClick={stopAndClose} 
          className="w-16 h-16 bg-white/20 hover:bg-white/30 backdrop-blur-xl border-2 border-white/40 rounded-full flex items-center justify-center text-white active:scale-90 transition-all shadow-2xl"
          aria-label="Fechar Câmera"
        >
          <X size={40} strokeWidth={3} />
        </button>
      </div>

      <div className="relative flex-1 bg-black flex items-center justify-center">
        {/* Container do Scanner */}
        <div id={containerId} className="w-full h-full"></div>

        {/* FEEDBACK DE SCANNER ATIVO */}
        {!isInitializing && !errorMsg && (
          <div className="absolute inset-0 pointer-events-none z-20 flex flex-col items-center justify-center">
            <div className="relative w-[300px] h-[300px] border-4 border-indigo-500/30 rounded-[3rem] overflow-hidden">
              {/* Cantos de Foco */}
              <div className="absolute top-0 left-0 w-12 h-12 border-t-8 border-l-8 border-indigo-500 rounded-tl-3xl"></div>
              <div className="absolute top-0 right-0 w-12 h-12 border-t-8 border-r-8 border-indigo-500 rounded-tr-3xl"></div>
              <div className="absolute bottom-0 left-0 w-12 h-12 border-b-8 border-l-8 border-indigo-500 rounded-bl-3xl"></div>
              <div className="absolute bottom-0 right-0 w-12 h-12 border-b-8 border-r-8 border-indigo-500 rounded-br-3xl"></div>
              
              {/* Laser Animado */}
              <div className="w-full h-2 bg-indigo-400 shadow-[0_0_25px_rgba(79,70,229,1)] absolute top-0 animate-[laser_2s_infinite]"></div>
            </div>
            
            <div className="mt-10 px-8 py-4 bg-indigo-600/20 backdrop-blur-md rounded-2xl border border-indigo-500/30">
              <p className="text-white font-black uppercase italic tracking-widest text-sm text-center">Aponte para o QR Code do Pallet</p>
            </div>
          </div>
        )}

        {isInitializing && (
          <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-6 z-[90]">
            <Loader2 className="w-16 h-16 animate-spin text-indigo-500" />
            <span className="text-white/40 font-black uppercase text-xs tracking-widest">Ativando Lente...</span>
          </div>
        )}

        {errorMsg && (
          <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center p-10 text-center z-[95]">
            <div className="bg-rose-500/10 p-10 rounded-[3rem] border-2 border-rose-500/20 max-w-sm">
              <AlertTriangle className="text-rose-500 w-20 h-20 mx-auto mb-6" />
              <h4 className="font-black text-white uppercase italic text-xl mb-4">Falha Técnica</h4>
              <p className="text-rose-200/60 font-bold text-xs uppercase leading-relaxed mb-10">{errorMsg}</p>
              <button 
                onClick={stopAndClose} 
                className="w-full bg-rose-600 text-white py-5 rounded-2xl font-black text-sm uppercase shadow-2xl active:scale-95 transition-all"
              >
                Voltar ao Painel
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes laser {
          0% { top: 0%; opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        #qr-reader-full-resilient__dashboard { display: none !important; }
        #qr-reader-full-resilient video { 
          width: 100% !important; 
          height: 100% !important; 
          object-fit: cover !important;
          transition: filter 0.2s ease;
        }
      `}</style>
    </div>
  );
};
