
// @ts-nocheck
import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Text, ContactShadows } from '@react-three/drei';
import { PalletPosition, RackId } from '../types';

interface Warehouse3DProps {
  inventory: PalletPosition[];
  onPositionClick?: (rack: RackId, level: number, pos: number) => void;
}

const PalletBox = ({ 
  position, 
  occupied, 
  data,
  onClick 
}: { 
  position: [number, number, number], 
  occupied: boolean,
  data: { rack: RackId, level: number, pos: number },
  onClick: () => void
}) => {
  return (
    <mesh position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <boxGeometry args={[0.9, 0.7, 1.1]} />
      <meshStandardMaterial 
        color={occupied ? '#4f46e5' : '#f1f5f9'} 
        roughness={0.3} 
        metalness={0.2}
        emissive={occupied ? '#4f46e5' : '#000000'}
        emissiveIntensity={occupied ? 0.2 : 0}
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
      {/* Label do Rack */}
      <Text
        position={[width / 2, height + 1, 0]}
        fontSize={2}
        color="#1e293b"
        font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGkyMZhrib2Bg-4.ttf"
      >
        RACK {rackId}
      </Text>
      
      {/* Vigas verticais (simbolizadas) */}
      {Array.from({ length: Math.ceil(positions / 5) + 1 }).map((_, i) => (
        <mesh key={i} position={[i * 5 * 1.1 - 0.5, height / 2, 0]}>
          <boxGeometry args={[0.1, height, 0.1]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
      ))}

      {/* Vigas horizontais (níveis) */}
      {Array.from({ length: levels + 1 }).map((_, i) => (
        <mesh key={i} position={[width / 2 - 0.5, i * 1.2 - 0.4, 0]}>
          <boxGeometry args={[width, 0.05, 1.2]} />
          <meshStandardMaterial color="#cbd5e1" />
        </mesh>
      ))}
    </group>
  );
};

export const Warehouse3D: React.FC<Warehouse3DProps> = ({ inventory, onPositionClick }) => {
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
        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-1">Interação em Tempo Real</p>
      </div>

      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[50, 30, 80]} fov={45} />
        <OrbitControls 
          enableDamping 
          dampingFactor={0.05} 
          minDistance={10} 
          maxDistance={200}
          target={[35, 5, 10]}
        />
        
        <ambientLight intensity={0.5} />
        <spotLight position={[50, 50, 50]} angle={0.15} penumbra={1} intensity={1} castShadow />
        <pointLight position={[-10, 10, -10]} intensity={0.5} />
        
        <group>
          {racks.map((rackId, rIdx) => {
            const xOffset = 0;
            const zOffset = rIdx * 10;
            
            return (
              <group key={rackId}>
                <RackStructure rackId={rackId} offset={[xOffset, 0, zOffset]} />
                
                {Array.from({ length: levels }).map((_, lIdx) => (
                  Array.from({ length: positionsPerLevel }).map((_, pIdx) => {
                    const level = lIdx + 1;
                    const pos = pIdx + 1;
                    const key = `${rackId}-${level}-${pos}`;
                    const item = inventoryMap.get(key);
                    
                    return (
                      <PalletBox 
                        key={key}
                        position={[pIdx * 1.1 + xOffset, lIdx * 1.2 + 0.35, zOffset]}
                        occupied={!!item}
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

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[35, -0.5, 10]} receiveShadow>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
        
        <ContactShadows position={[35, -0.49, 10]} opacity={0.4} scale={150} blur={2} far={10} />
        <Environment preset="city" />
      </Canvas>

      <div className="absolute bottom-6 right-6 z-10 bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2 pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-indigo-600 rounded-sm"></div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Ocupado</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-slate-200 rounded-sm"></div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Disponível</span>
        </div>
      </div>
    </div>
  );
};
