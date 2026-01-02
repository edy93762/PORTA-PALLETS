
// @ts-nocheck
import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Text, ContactShadows } from '@react-three/drei';
import { PalletPosition, RackId } from '../types';

interface Warehouse3DProps {
  inventory: PalletPosition[];
  onPositionClick?: (rack: RackId, level: number, pos: number) => void;
  stats?: {
    occupied: number;
    free: number;
    total: number;
    rate: number;
  };
  highlightProductId?: string | null;
}

const PalletBox = ({ 
  position, 
  occupied, 
  isHighlighted,
  data,
  onClick 
}: { 
  position: [number, number, number], 
  occupied: boolean,
  isHighlighted: boolean,
  data: { rack: RackId, level: number, pos: number },
  onClick: () => void
}) => {
  // Cores dinâmicas para o highlight
  const baseColor = isHighlighted ? '#f59e0b' : (occupied ? '#4f46e5' : '#f1f5f9');
  const emissiveColor = isHighlighted ? '#f59e0b' : (occupied ? '#4f46e5' : '#000000');
  const emissiveInt = isHighlighted ? 1.5 : (occupied ? 0.2 : 0);

  return (
    <mesh position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <boxGeometry args={[0.9, 0.7, 1.1]} />
      <meshStandardMaterial 
        color={baseColor} 
        roughness={0.2} 
        metalness={0.3}
        emissive={emissiveColor}
        emissiveIntensity={emissiveInt}
      />
    </mesh>
  );
};

const RackStructure = ({ rackId, offset }: { rackId: string, offset: [number, number, number] }) => {
  const levels = 5;
  const positions = 66;
  const width = positions * 1.1;
  const height = levels * 1.2;

  return (
    <group position={offset}>
      <Text
        position={[width / 2, height + 1.2, 0]}
        fontSize={2}
        color="#1e293b"
        font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGkyMZhrib2Bg-4.ttf"
      >
        PORTA PALLET {rackId}
      </Text>
      
      {Array.from({ length: Math.ceil(positions / 5) + 1 }).map((_, i) => (
        <mesh key={i} position={[i * 5 * 1.1 - 0.5, height / 2, 0]}>
          <boxGeometry args={[0.1, height, 0.1]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
      ))}

      {Array.from({ length: levels + 1 }).map((_, i) => (
        <mesh key={i} position={[width / 2 - 0.5, i * 1.2 - 0.4, 0]}>
          <boxGeometry args={[width, 0.05, 1.2]} />
          <meshStandardMaterial color="#cbd5e1" />
        </mesh>
      ))}
    </group>
  );
};

export const Warehouse3D: React.FC<Warehouse3DProps> = ({ inventory, onPositionClick, stats, highlightProductId }) => {
  const racks: RackId[] = ['A', 'B', 'C', 'D'];
  const levels = 5;
  const positionsPerLevel = 66;

  const inventoryMap = useMemo(() => {
    const map = new Map<string, PalletPosition>();
    inventory.forEach(item => {
      map.set(`${item.rack}-${item.level}-${item.position}`, item);
    });
    return map;
  }, [inventory]);

  return (
    <div className="w-full h-full bg-slate-100 rounded-[2rem] md:rounded-[3rem] overflow-hidden border border-slate-200 shadow-inner relative">
      <div className="absolute top-6 left-6 z-10 pointer-events-none">
        <h3 className="text-xl font-black text-slate-800 italic tracking-tighter uppercase leading-none">Simulação 3D</h3>
        {highlightProductId && (
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mt-1 animate-pulse">Destacando: {highlightProductId}</p>
        )}
      </div>

      {stats && (
        <div className="absolute bottom-6 left-6 z-30 bg-slate-900/95 backdrop-blur-md p-5 rounded-[2.5rem] border border-white/10 shadow-2xl flex gap-6 pointer-events-auto scale-90 md:scale-100 origin-bottom-left">
          <div className="text-center">
            <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest mb-1">Ocupadas</p>
            <p className="text-xl font-black text-white italic leading-none">{stats.occupied}</p>
          </div>
          <div className="w-px bg-white/10 h-8 self-center"></div>
          <div className="text-center">
            <p className="text-[9px] font-black text-emerald-300 uppercase tracking-widest mb-1">Livres</p>
            <p className="text-xl font-black text-white italic leading-none">{stats.free}</p>
          </div>
        </div>
      )}

      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[50, 45, 100]} fov={45} />
        <OrbitControls 
          enableDamping 
          dampingFactor={0.05} 
          minDistance={10} 
          maxDistance={250}
          target={[35, 5, 25]}
        />
        
        <ambientLight intensity={0.6} />
        <spotLight position={[50, 100, 50]} angle={0.2} penumbra={1} intensity={1.5} castShadow />
        
        <group>
          {racks.map((rackId, rIdx) => {
            const zOffset = rIdx * 16;
            return (
              <group key={rackId}>
                <RackStructure rackId={rackId} offset={[0, 0, zOffset]} />
                {Array.from({ length: levels }).map((_, lIdx) => (
                  Array.from({ length: positionsPerLevel }).map((_, pIdx) => {
                    const level = lIdx + 1;
                    const pos = pIdx + 1;
                    const key = `${rackId}-${level}-${pos}`;
                    const item = inventoryMap.get(key);
                    const isHighlighted = !!(item && highlightProductId && item.productId === highlightProductId);
                    
                    return (
                      <PalletBox 
                        key={key}
                        position={[pIdx * 1.1, lIdx * 1.2 + 0.35, zOffset]}
                        occupied={!!item}
                        isHighlighted={isHighlighted}
                        data={{ rack: rackId, level, pos }}
                        onClick={() => onPositionClick?.(rackId, level, pos)}
                      />
                    );
                  })
                ))}
              </group>
            );
          })}
        </group>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[35, -0.5, 25]} receiveShadow>
          <planeGeometry args={[350, 350]} />
          <meshStandardMaterial color="#f1f5f9" />
        </mesh>
        
        <ContactShadows position={[35, -0.49, 25]} opacity={0.4} scale={300} blur={2.5} far={20} />
        <Environment preset="warehouse" />
      </Canvas>

      <div className="absolute bottom-6 right-6 z-30 bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-xl flex flex-col gap-2 pointer-events-none">
        {highlightProductId && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-amber-500 rounded-sm animate-pulse"></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">Highlight SKU</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-indigo-600 rounded-sm"></div>
          <span className="text-[10px] font-black uppercase text-slate-700">Ocupado</span>
        </div>
      </div>
    </div>
  );
};
