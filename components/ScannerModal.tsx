
import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, Loader2, AlertTriangle, Scan } from 'lucide-react';

interface ScannerModalProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
  customHeader?: React.ReactNode;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({ onScan, onClose, customHeader }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader";
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const stopScanner = async () => {
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
          await scannerRef.current.clear();
        } catch (e) {
          console.warn("Aviso ao limpar scanner:", e);
        }
      }
    };

    const startScanner = async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      if (!isMounted) return;
      setIsInitializing(true);
      setErrorMsg(null);
      
      try {
        const element = document.getElementById(containerId);
        if (!element) throw new Error("Elemento do scanner não encontrado.");

        if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode(containerId);
        }

        const config = { 
          fps: 20, 
          qrbox: { width: 260, height: 260 },
          aspectRatio: 1.0
        };

        const onScanSuccess = (decodedText: string) => {
          if (isMounted) {
            onScan(decodedText);
          }
        };

        try {
          const devices = await Html5Qrcode.getCameras();
          if (!devices || devices.length === 0) {
            await scannerRef.current.start({ facingMode: "environment" }, config, onScanSuccess, () => {});
          } else {
            const backCamera = devices.find(d => 
              d.label.toLowerCase().includes('back') || 
              d.label.toLowerCase().includes('traseira') || 
              d.label.toLowerCase().includes('rear')
            );
            const cameraId = backCamera ? backCamera.id : devices[devices.length - 1].id;
            await scannerRef.current.start(cameraId, config, onScanSuccess, () => {});
          }
          if (isMounted) setIsInitializing(false);
        } catch (innerErr: any) {
          await scannerRef.current.start({ facingMode: "user" }, config, onScanSuccess, () => {});
          if (isMounted) setIsInitializing(false);
        }

      } catch (err: any) {
        if (isMounted) {
          setErrorMsg("Câmera não disponível ou permissão negada.");
          setIsInitializing(false);
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-slate-950 z-[9999] flex flex-col items-center justify-center animate-in fade-in duration-300">
      
      {/* BOTÃO FECHAR FLUTUANTE - ÁREA DE TOQUE AMPLIADA PARA MOBILE */}
      <button 
        onClick={onClose} 
        className="absolute top-6 right-6 z-[100] w-14 h-14 bg-white/10 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center text-white active:scale-90 transition-all shadow-2xl"
        aria-label="Fechar Scanner"
      >
        <X size={32} />
      </button>

      {/* HEADER DISCRETO */}
      <div className="absolute top-8 left-0 right-0 flex justify-center pointer-events-none z-[80]">
        <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md px-6 py-3 rounded-full border border-white/10">
          <Camera size={18} className="text-indigo-400" />
          <span className="text-[11px] font-black uppercase tracking-widest text-white italic">Scanner Ativo</span>
        </div>
      </div>

      {/* ÁREA DA CÂMERA */}
      <div className="relative w-full h-full flex items-center justify-center bg-black">
        <div id={containerId} className="w-full h-full object-cover"></div>

        {/* OVERLAY DE SCAN */}
        {!isInitializing && !errorMsg && (
          <div className="absolute inset-0 pointer-events-none z-20 flex flex-col items-center justify-center">
            {/* MOLDURA DE SCAN */}
            <div className="relative w-64 h-64 border-2 border-white/20 rounded-[2rem] overflow-hidden">
              {/* CANTOS DESTACADOS */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-indigo-500 rounded-tl-xl"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-indigo-500 rounded-tr-xl"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-indigo-500 rounded-bl-xl"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-indigo-500 rounded-br-xl"></div>
              
              {/* LINHA DE SCAN ANIMADA */}
              <div className="w-full h-1 bg-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.8)] absolute top-0 animate-[scan_2s_infinite]"></div>
            </div>

            <div className="mt-12 text-center space-y-2">
              <p className="text-white font-black uppercase italic tracking-tighter text-sm drop-shadow-lg">Aponte para o QR Code do Pallet</p>
              <p className="text-white/40 font-bold uppercase text-[9px] tracking-widest">O scan é automático ao detectar</p>
            </div>
          </div>
        )}

        {/* LOADING STATE */}
        {isInitializing && !errorMsg && (
          <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-4 z-[90]">
            <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
            <span className="text-white/40 font-black uppercase text-[10px] tracking-[0.2em]">Iniciando Câmera...</span>
          </div>
        )}

        {/* ERROR STATE */}
        {errorMsg && (
          <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center p-10 text-center z-[95]">
            <div className="bg-rose-500/10 p-8 rounded-[3rem] border border-rose-500/20 max-w-xs">
              <AlertTriangle className="text-rose-500 w-16 h-16 mx-auto mb-6" />
              <h4 className="font-black text-white uppercase italic text-lg mb-2">Ops! Problema na Câmera</h4>
              <p className="text-rose-200/60 font-bold text-[10px] uppercase leading-relaxed mb-8">
                {errorMsg}
              </p>
              <button 
                onClick={() => window.location.reload()} 
                className="w-full bg-rose-600 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-xl active:scale-95 transition-all"
              >
                REINICIAR APP
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        #qr-reader__dashboard { display: none !important; }
        #qr-reader video { 
          width: 100% !important; 
          height: 100% !important; 
          object-fit: cover !important;
        }
      `}</style>
    </div>
  );
};
