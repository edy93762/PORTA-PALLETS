
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
      // Pequeno delay para garantir montagem do DOM
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
          fps: 15, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        };

        const onScanSuccess = (decodedText: string) => {
          if (isMounted) {
            onScan(decodedText);
            stopScanner();
          }
        };

        // ESTRATÉGIA: Primeiro tenta obter câmeras para validar permissão
        try {
          const devices = await Html5Qrcode.getCameras();
          
          if (!devices || devices.length === 0) {
            // Se não listar, tenta forçar via constraints (muitos navegadores mobile funcionam assim)
            await scannerRef.current.start(
              { facingMode: "environment" }, 
              config, 
              onScanSuccess,
              () => {} 
            );
          } else {
            // Se listar, prioriza a traseira (back/traseira/rear)
            const backCamera = devices.find(d => 
              d.label.toLowerCase().includes('back') || 
              d.label.toLowerCase().includes('traseira') || 
              d.label.toLowerCase().includes('rear')
            );
            
            const cameraId = backCamera ? backCamera.id : devices[devices.length - 1].id;
            
            await scannerRef.current.start(
              cameraId,
              config,
              onScanSuccess,
              () => {}
            );
          }
          
          if (isMounted) setIsInitializing(false);
        } catch (innerErr: any) {
          console.warn("Tentativa falhou, tentando fallback genérico...", innerErr);
          // Fallback final: qualquer câmera disponível
          await scannerRef.current.start(
            { facingMode: "user" }, // Se não tem traseira, tenta frontal
            config,
            onScanSuccess,
            () => {}
          );
          if (isMounted) setIsInitializing(false);
        }

      } catch (err: any) {
        if (isMounted) {
          console.error("Erro ao iniciar scanner:", err);
          let message = "Câmera não disponível ou permissão negada.";
          if (err.message?.includes("device not found")) {
            message = "Câmera não encontrada. Verifique se o dispositivo possui câmera traseira e se o navegador tem permissão.";
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
            <h3 className="font-black uppercase italic tracking-tighter leading-none">Scanner Ativo</h3>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all">
            <X size={24} />
          </button>
        </header>

        <div className="p-8 flex flex-col items-center min-h-[380px] justify-center relative bg-slate-50">
          {errorMsg ? (
            <div className="w-full p-8 bg-rose-50 border-2 border-rose-100 rounded-[2rem] flex flex-col items-center text-center gap-4">
              <AlertTriangle className="text-rose-500 w-12 h-12" />
              <div>
                <h4 className="font-black text-rose-900 uppercase italic">Erro de Conexão</h4>
                <p className="text-[11px] text-rose-600 font-bold uppercase mt-4 leading-relaxed">
                  {errorMsg}
                </p>
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="mt-2 bg-rose-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center gap-2"
              >
                <RefreshCw size={14}/> REINICIAR APP
              </button>
            </div>
          ) : (
            <>
              <div className="relative w-full aspect-square bg-black rounded-[2rem] overflow-hidden border-4 border-white shadow-2xl">
                <div id={containerId} className="w-full h-full"></div>
                
                {isInitializing && (
                  <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center gap-4 z-10">
                    <Loader2 className="w-10 h-10 animate-spin text-white opacity-50" />
                    <p className="font-black text-white/40 uppercase text-[9px] tracking-widest">Acessando Hardware...</p>
                  </div>
                )}

                {!isInitializing && (
                  <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
                    <div className="w-48 h-48 border-2 border-indigo-500 rounded-3xl opacity-50 animate-pulse"></div>
                  </div>
                )}
              </div>
              
              {!isInitializing && (
                <div className="mt-8 text-center">
                  <p className="font-black text-slate-800 uppercase tracking-tight italic">Enquadre o QR Code</p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Foco Automático Habilitado</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
