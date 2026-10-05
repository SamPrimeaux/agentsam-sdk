/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Float, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { DashboardWidget } from '../services/orchestrator';

interface ThreeWeatherVisProps {
  widget: DashboardWidget;
}

const Bar = ({ position, height, color, label, value }: { position: [number, number, number], height: number, color: string, label: string, value: string }) => {
  const mesh = useRef<THREE.Mesh>(null);
  
  // Animate the bars growing
  useFrame((state) => {
    if (mesh.current) {
      mesh.current.scale.y = THREE.MathUtils.lerp(mesh.current.scale.y, 1, 0.1);
    }
  });

  return (
    <group position={position}>
      <mesh ref={mesh} position={[0, height / 2, 0]} scale={[1, 0, 1]}>
        <boxGeometry args={[0.8, height, 0.8]} />
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.2} />
      </mesh>
      {/* Label below */}
      <Text
        position={[0, -0.5, 0.5]}
        fontSize={0.3}
        color="#a1a1aa"
        anchorX="center"
        anchorY="top"
        rotation={[-Math.PI / 4, 0, 0]}
      >
        {label}
      </Text>
      {/* Value above */}
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
        <Text
          position={[0, height + 0.5, 0]}
          fontSize={0.4}
          color="#fff"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.02}
          outlineColor="#000"
        >
          {value}
        </Text>
      </Float>
    </group>
  );
};

const Scene = ({ widget }: { widget: DashboardWidget }) => {
  const data = widget.customData || [];
  const xAxisKey = widget.xAxisKey || 'date';
  // Use first data key for visualization if available, otherwise 'temperature_2m'
  const dataKey = widget.dataKeys?.[0] || 'temperature_2m';
  
  const processedData = useMemo(() => {
    // Limit to top 20 items to avoid clutter
    const sliced = data.slice(0, 20);
    const maxVal = Math.max(...sliced.map((d: any) => Number(d[dataKey]) || 0), 10);
    
    return sliced.map((item: any, index: number) => {
      const val = Number(item[dataKey]) || 0;
      // Normalize height: max height 10 units
      const height = (val / maxVal) * 8; 
      // Calculate color based on value (e.g. cold blue to hot red)
      const t = Math.min(Math.max((val + 10) / 50, 0), 1); // approximate range -10 to 40
      const color = new THREE.Color().setHSL(0.6 - t * 0.6, 1, 0.5); // Blue to Red
      
      // Simple date formatting
      let label = item[xAxisKey];
      if (typeof label === 'string' && label.includes('T')) {
          const date = new Date(label);
          label = `${date.getDate()}/${date.getMonth() + 1} ${date.getHours()}h`;
      } else if (typeof label === 'string' && label.includes('-')) {
          const date = new Date(label);
          label = `${date.getDate()}/${date.getMonth() + 1}`;
      }

      return {
        position: [(index - sliced.length / 2) * 1.5, 0, 0] as [number, number, number],
        height,
        color: color.getStyle(),
        label: String(label).substring(0, 10),
        value: val.toFixed(1)
      };
    });
  }, [data, dataKey, xAxisKey]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <Stars radius={50} depth={50} count={1000} factor={4} saturation={0} fade speed={1} />
      
      <group position={[0, -2, 0]}>
        {processedData.map((d, i) => (
          <Bar key={i} {...d} />
        ))}
      </group>
      
      <OrbitControls 
        enablePan={true} 
        enableZoom={true} 
        enableRotate={true}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 2}
      />
    </>
  );
};

export const ThreeWeatherVis: React.FC<ThreeWeatherVisProps> = ({ widget }) => {
  return (
    <div className="w-full h-[400px] backdrop-blur-[22px] bg-black/10 rounded-[15px] overflow-hidden">
      <Canvas camera={{ position: [0, 5, 15], fov: 50 }}>
        <Scene widget={widget} />
      </Canvas>
    </div>
  );
};
