
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';

interface ScannerModalProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({ onScan, onClose }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader";
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const stopScanner = async () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        try {
          await scannerRef.current.stop();
          await scannerRef.current.clear();
        } catch (e) {
          console.error("Erro ao parar scanner:", e);
        }
      }
    };

    const startScanner = async () => {
      // Pequeno delay para garantir que o elemento DOM foi processado pelo React
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (!isMounted) return;
      setIsInitializing(true);
      setErrorMsg(null);
      
      try {
        const element = document.getElementById(containerId);
        if (!element) {
          throw new Error("Elemento de renderização do scanner não encontrado no DOM.");
        }

        if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode(containerId);
        }

        const config = { 
          fps: 10, 
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(minEdge * 0.7);
            return { width: size, height: size };
          }
        };

        const onScanSuccess = (decodedText: string) => {
          if (isMounted) {
            onScan(decodedText);
            stopScanner();
          }
        };

        // TENTATIVA 1: Direto com environment
        try {
          await scannerRef.current.start(
            { facingMode: "environment" }, 
            config, 
            onScanSuccess,
            () => {} 
          );
          if (isMounted) setIsInitializing(false);
          return;
        } catch (err: any) {
          console.warn("Tentativa 1 (facingMode: environment) falhou:", err);
        }

        // TENTATIVA 2: Listar câmeras e buscar por labels ou posição
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          throw new Error("Nenhuma câmera encontrada no dispositivo.");
        }

        const sortedCameras = [...cameras].sort((a, b) => {
          const labelA = a.label.toLowerCase();
          const labelB = b.label.toLowerCase();
          const isBackA = labelA.includes('back') || labelA.includes('traseira') || labelA.includes('rear');
          const isBackB = labelB.includes('back') || labelB.includes('traseira') || labelB.includes('rear');
          
          if (isBackA && !isBackB) return -1;
          if (!isBackA && isBackB) return 1;
          return 0; 
        });

        let started = false;
        for (const camera of sortedCameras) {
          try {
            await scannerRef.current.start(
              camera.id,
              config,
              onScanSuccess,
              () => {}
            );
            started = true;
            break;
          } catch (e) {
            console.warn(`Falha ao iniciar câmera ID: ${camera.id}`, e);
          }
        }

        if (!started) {
          throw new Error("Não foi possível iniciar nenhuma das câmeras disponíveis.");
        }

        if (isMounted) setIsInitializing(false);

      } catch (err: any) {
        if (isMounted) {
          console.error("Erro fatal ao iniciar scanner:", err);
          let message = err.message || "Erro desconhecido ao acessar a câmera.";
          if (message.includes("NotFoundError") || message.includes("Requested device not found")) {
            message = "Câmera não encontrada. Certifique-se de que o dispositivo possui uma câmera traseira funcional e que o site tem permissão de acesso.";
          }
          setErrorMsg(message);
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
    <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[4500] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in-95">
        <header className="p-6 bg-indigo-600 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Camera size={24} />
            <h3 className="font-black uppercase italic tracking-tighter">Scanner de Etiqueta</h3>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all">
            <X size={24} />
          </button>
        </header>

        <div className="p-8 flex flex-col items-center min-h-[350px] justify-center relative">
          {errorMsg ? (
            <div className="w-full p-8 bg-rose-50 border-2 border-rose-100 rounded-[2rem] flex flex-col items-center text-center gap-4">
              <AlertTriangle className="text-rose-500 w-12 h-12" />
              <div>
                <h4 className="font-black text-rose-900 uppercase italic leading-none">Falha na Conexão</h4>
                <p className="text-[11px] text-rose-600 font-bold uppercase mt-4 leading-relaxed">
                  {errorMsg}
                </p>
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="mt-2 bg-rose-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center gap-2"
              >
                <RefreshCw size={14}/> Tentar Novamente
              </button>
            </div>
          ) : (
            <>
              <div className="relative w-full aspect-square bg-slate-100 rounded-[2rem] overflow-hidden border-4 border-slate-100 shadow-inner">
                {/* O container DEVE estar sempre no DOM para que o Html5Qrcode funcione */}
                <div id={containerId} className="w-full h-full"></div>
                
                {/* Overlay de carregamento */}
                {isInitializing && (
                  <div className="absolute inset-0 bg-slate-100 flex flex-col items-center justify-center gap-4 z-10">
                    <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
                    <p className="font-black text-slate-400 uppercase text-[10px] tracking-widest">Iniciando Câmera...</p>
                  </div>
                )}

                {/* Overlay de foco visual (apenas se não estiver carregando) */}
                {!isInitializing && (
                  <div className="absolute inset-0 border-[60px] border-black/40 pointer-events-none z-20">
                    <div className="w-full h-full border-2 border-indigo-400 rounded-xl animate-pulse"></div>
                  </div>
                )}
              </div>
              
              {!isInitializing && (
                <div className="mt-8 text-center space-y-2">
                  <p className="font-black text-slate-800 uppercase tracking-tight italic">Aponte para o QR Code</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Scanner Automático Ativo</p>
                </div>
              )}
            </>
          )}
        </div>

        {!errorMsg && !isInitializing && (
          <footer className="p-6 bg-slate-50 border-t border-slate-100 flex justify-center">
             <button onClick={() => window.location.reload()} className="flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 px-6 py-3 rounded-xl transition-all">
               <RefreshCw size={14}/> Reiniciar Câmera
             </button>
          </footer>
        )}
      </div>
    </div>
  );
};
