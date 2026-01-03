
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
  isDouble,
  data,
  onClick 
}: { 
  position: [number, number, number], 
  occupied: boolean, 
  isHighlighted: boolean,
  isDouble?: boolean,
  data: { rack: RackId, level: number, pos: number },
  onClick: () => void
}) => {
  const boxArgs = isDouble ? [2.15, 0.7, 1.1] : [0.95, 0.7, 1.1];
  const boxPosition: [number, number, number] = isDouble 
    ? [position[0] + 0.6, position[1], position[2]] 
    : position;

  const baseColor = isHighlighted 
    ? '#f59e0b' 
    : (occupied ? '#e11d48' : '#10b981');

  const emissiveColor = isHighlighted 
    ? '#f59e0b' 
    : (occupied ? '#e11d48' : '#059669');

  const emissiveInt = isHighlighted ? 1.5 : (occupied ? 0.3 : 0.1);

  return (
    <mesh position={boxPosition} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <boxGeometry args={boxArgs} />
      <meshStandardMaterial 
        color={baseColor} 
        roughness={0.2} 
        metalness={0.3}
        emissive={emissiveColor}
        emissiveIntensity={emissiveInt}
        transparent={!occupied}
        opacity={occupied ? 1 : 0.3}
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
    if (inventory) {
      inventory.forEach(item => {
        map.set(`${item.rack}-${item.level}-${item.position}`, item);
      });
    }
    return map;
  }, [inventory]);

  return (
    <div className="w-full h-full bg-slate-100 rounded-[2rem] md:rounded-[3rem] overflow-hidden border border-slate-200 shadow-inner relative">
      <div className="absolute top-6 left-6 z-10 pointer-events-none">
        <h3 className="text-xl font-black text-slate-800 italic uppercase leading-none">Mapa 3D (A-D)</h3>
      </div>

      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[50, 45, 120]} fov={45} />
        <OrbitControls 
          enableDamping 
          dampingFactor={0.05} 
          minDistance={10} 
          maxDistance={300}
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
                {Array.from({ length: levels }).map((_, lIdx) => {
                  let skipNext = false;
                  return Array.from({ length: positionsPerLevel }).map((_, pIdx) => {
                    if (skipNext) {
                      skipNext = false;
                      return null;
                    }

                    const level = lIdx + 1;
                    const pos = pIdx + 1;
                    const key = `${rackId}-${level}-${pos}`;
                    
                    const item = inventoryMap.get(key);
                    const isDouble = item?.slots === 2;
                    if (isDouble) skipNext = true;

                    const isOccupied = !!item;
                    const isHighlighted = !!(item && highlightProductId && item.productId === highlightProductId);
                    
                    return (
                      <PalletBox 
                        key={key}
                        position={[pIdx * 1.1, lIdx * 1.2 + 0.35, zOffset]}
                        occupied={isOccupied}
                        isHighlighted={isHighlighted}
                        isDouble={isDouble}
                        data={{ rack: rackId, level, pos }}
                        onClick={() => onPositionClick?.(rackId, level, pos)}
                      />
                    );
                  });
                })}
              </group>
            );
          })}
        </group>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[35, -0.5, 30]} receiveShadow>
          <planeGeometry args={[400, 400]} />
          <meshStandardMaterial color="#f1f5f9" />
        </mesh>
        
        <ContactShadows position={[35, -0.49, 30]} opacity={0.4} scale={400} blur={2.5} far={20} />
        <Environment preset="warehouse" />
      </Canvas>
    </div>
  );
};
