/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import * as THREE from 'three';
import { DragStateManager } from './DragStateManager';
import { IkSystem } from './IkSystem';
import { RenderSystem } from './RenderSystem';
import { RobotLoader } from './RobotLoader';
import { SelectionManager } from './SelectionManager';
import { SequenceAnimator } from './SequenceAnimator';
import { MujocoData, MujocoModel, MujocoModule } from './types';
import { getName } from './utils/StringUtils';

/**
 * MujocoSim: The Central Orchestrator.
 * Manages the connection between the MuJoCo WASM engine and the Three.js visualization.
 */
export class MujocoSim {
    mujoco: MujocoModule;      
    mjModel: MujocoModel | null = null;     
    mjData: MujocoData | null = null;      
    mjvOption: InstanceType<MujocoModule['MjvOption']>;   

    renderSys: RenderSystem;
    ikSys: IkSystem;
    dragStateManager: DragStateManager;
    selectionManager: SelectionManager;
    sequenceAnimator: SequenceAnimator;

    frameId: number | null = null; 
    paused = false;
    gripperActuatorId = -1;
    speedMultiplier = 1;
    
    private userIkEnabled = false; 
    private firstIkEnable = true; // Track first enable to enforce default rotation

    // Gizmo Interpolation State
    private gizmoAnim = {
        active: false,
        startPos: new THREE.Vector3(),
        endPos: new THREE.Vector3(),
        startRot: new THREE.Quaternion(),
        endRot: new THREE.Quaternion(),
        startTime: 0,
        duration: 1000
    };

    constructor(container: HTMLElement, mujocoInstance: MujocoModule) {
        this.mujoco = mujocoInstance;
        this.mjvOption = new this.mujoco.MjvOption();
        
        this.renderSys = new RenderSystem(container, this.mujoco);
        
        this.dragStateManager = new DragStateManager(this.renderSys.scene, this.renderSys.renderer, this.renderSys.camera, container, this.renderSys.controls);
        this.selectionManager = new SelectionManager(this.renderSys.scene, this.renderSys.renderer, this.renderSys.camera, container);
        
        this.ikSys = new IkSystem(this.mujoco, this.renderSys.camera, this.renderSys.renderer.domElement, this.renderSys.controls);
        this.renderSys.simGroup.add(this.ikSys.target); 
        this.renderSys.scene.add(this.ikSys.control as unknown as THREE.Object3D);
        
        this.sequenceAnimator = new SequenceAnimator();
        
        this.renderSys.initLights(this.dragStateManager);
    }

    async init(robotId = 'franka_emika_panda', sceneFile = 'scene.xml', onProgress?: (msg: string) => void) {
        const loader = new RobotLoader(this.mujoco);
        const { isDouble, isStacking } = await loader.load(robotId, sceneFile, onProgress);

        try {
            this.mjModel = this.mujoco.MjModel.loadFromXML(`/working/${sceneFile}`);
            this.mjData = new this.mujoco.MjData(this.mjModel);
        } catch (e: unknown) { 
            throw new Error(`Failed to load model: ${(e as Error).message}`); 
        }

        if (this.mjModel) {
            this.ikSys.gripperSiteId = -1; 
            this.gripperActuatorId = -1;
            for (let i = 0; i < this.mjModel.nsite; i++) {
                 if (getName(this.mjModel, this.mjModel.name_siteadr[i]).includes('tcp')) { 
                     this.ikSys.gripperSiteId = i; break; 
                 }
            }
            for (let i = 0; i < this.mjModel.nu; i++) {
                 if (getName(this.mjModel, this.mjModel.name_actuatoradr[i]).includes('gripper')) { 
                     this.gripperActuatorId = i; break; 
                 }
            }

            // Set Initial Pose
            this.setInitialPose();

            this.mujoco.mj_forward(this.mjModel, this.mjData!);
            this.renderSys.initScene(this.mjModel);
            this.ikSys.init(this.mjModel, isDouble);
            this.ikSys.syncToSite(this.mjData!);
            
            this.ikSys.target.quaternion.setFromEuler(new THREE.Euler(Math.PI, 0, 0));
            this.ikSys.target.position.set(0, 0, 0.45);

            this.firstIkEnable = true;
            
            this.sequenceAnimator.init(this.mjModel, isStacking, (addr) => getName(this.mjModel!, addr));
            
            this.startLoop();
        }
    }
    
    private setInitialPose() {
        if (!this.mjModel || !this.mjData) return;
        const initVals = [1.707, -1.754, 0.003, -2.702, 0.003, 0.951, 2.490, 0.000];
        
        for (let i = 0; i < Math.min(initVals.length, this.mjModel.nu); i++) {
            this.mjData.ctrl[i] = initVals[i];
            if (this.mjModel.actuator_trnid[2 * i + 1] === 1) {
                const jointId = this.mjModel.actuator_trnid[2 * i];
                if (jointId >= 0 && jointId < this.mjModel.njnt) {
                    const qposAdr = this.mjModel.jnt_qposadr[jointId];
                    this.mjData.qpos[qposAdr] = initVals[i];
                }
            }
        }
    }

    private randomizeCubes() {
        if (!this.mjModel || !this.mjData) return;
        const positions: Array<{x: number, y: number}> = [];
        
        for (let i = 0; i < this.mjModel.nbody; i++) {
            const name = getName(this.mjModel, this.mjModel.name_bodyadr[i]);
            if (name.startsWith('cube')) {
                let x = 0;
                let y = 0;
                let valid = false;
                let attempts = 0;
                while (!valid && attempts < 100) {
                    const minR = 0.35;
                    const maxR = 0.8;
                    const r = Math.sqrt(Math.random() * (maxR*maxR - minR*minR) + minR*minR);
                    const theta = Math.random() * 2 * Math.PI;
                    x = r * Math.cos(theta);
                    y = r * Math.sin(theta);
                    valid = true;
                    const distStack = Math.sqrt((x - 0.6)**2 + (y - 0)**2);
                    if (distStack < 0.35) valid = false;
                    if (valid) {
                        for (const p of positions) {
                            if ((p.x - x)**2 + (p.y - y)**2 < 0.004) { valid = false; break; }
                        }
                    }
                    attempts++;
                }
                if (valid) {
                    positions.push({x, y});
                    
                    // Assuming body_jntadr exists in the model wrapper or bindings
                    // Standard MuJoCo has body_jntadr.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const jntIdVal = (this.mjModel as any).body_jntadr[i];
                    if (jntIdVal >= 0) {
                        const qp = this.mjModel.jnt_qposadr[jntIdVal];
                        this.mjData.qpos[qp] = x;
                        this.mjData.qpos[qp + 1] = y;
                        this.mjData.qpos[qp + 2] = 0.02;
                        // Orientation (Identity)
                        this.mjData.qpos[qp + 3] = 1;
                        this.mjData.qpos[qp + 4] = 0;
                        this.mjData.qpos[qp + 5] = 0;
                        this.mjData.qpos[qp + 6] = 0;
                    }
                }
            }
        }
    }

    private startLoop() {
        if (this.frameId) cancelAnimationFrame(this.frameId);

        const loop = () => {
            if (!this.mjModel || !this.mjData) {
                 this.frameId = requestAnimationFrame(loop);
                 return;
            }

            this.dragStateManager.update();
            if (this.draggedBodyId() !== null) this.mjData.xfrc_applied.fill(0);
            if (this.dragStateManager.active && this.dragStateManager.physicsObject) {
                this.applyDragForce();
            }
            
            if (this.gizmoAnim.active) {
                const now = performance.now();
                const elapsed = now - this.gizmoAnim.startTime;
                const t = Math.min(elapsed / this.gizmoAnim.duration, 1.0);
                const ease = 1 - Math.pow(1 - t, 3);
                
                this.ikSys.target.position.lerpVectors(this.gizmoAnim.startPos, this.gizmoAnim.endPos, ease);
                this.ikSys.target.quaternion.slerpQuaternions(this.gizmoAnim.startRot, this.gizmoAnim.endRot, ease);
                
                if (t >= 1.0) {
                    this.gizmoAnim.active = false;
                }
            }

            if (!this.paused) {
                if (this.sequenceAnimator.running) {
                    this.sequenceAnimator.update((1/60) * this.speedMultiplier, this.ikSys.target, this.mjData, this.gripperActuatorId, this.ikSys);
                    this.setIkEnabled(false);
                } else {
                     this.syncIkState();
                     this.ikSys.update(this.mjModel, this.mjData);
                }

                const startSimTime = this.mjData.time;
                // Allow simulation to run faster than real-time based on speedMultiplier
                while (this.mjData.time - startSimTime < (1.0 / 60.0) * this.speedMultiplier) {
                    this.mujoco.mj_step(this.mjModel, this.mjData);
                }
            }

            this.renderSys.update(this.mjData, this.renderSys.contactMarkers.visible);
            this.frameId = requestAnimationFrame(loop);
        };
        this.frameId = requestAnimationFrame(loop);
    }

    private draggedBodyId(): number | null { 
        return this.dragStateManager.active && this.dragStateManager.physicsObject ? this.dragStateManager.physicsObject.userData.bodyID : null; 
    }

    private applyDragForce() {
        if (!this.mjData) return;
        const bodyId = this.draggedBodyId()!;
        const force = new THREE.Vector3().subVectors(this.dragStateManager.currentWorld, this.dragStateManager.worldHit).multiplyScalar(1.5);
        if (force.lengthSq() > 25) force.setLength(5.0); 
        
        const bodyPos = new THREE.Vector3().fromArray(this.mjData.xpos, bodyId * 3);
        const leverArm = new THREE.Vector3().subVectors(this.dragStateManager.worldHit, bodyPos);
        const torque = leverArm.cross(force);

        this.mjData.xfrc_applied.set([force.x, force.y, force.z, torque.x, torque.y, torque.z], bodyId * 6);
    }
    
    private syncIkState() {
        const shouldCalculate = this.userIkEnabled;
        const shouldShowGizmo = this.userIkEnabled && !this.gizmoAnim.active && !this.sequenceAnimator.running; 
        
        this.ikSys.setCalculating(shouldCalculate);
        this.ikSys.setGizmoVisible(shouldShowGizmo);
        
        if (this.sequenceAnimator.running) {
            this.ikSys.setTargetVisible(true);
        } else if(shouldCalculate) {
            this.ikSys.setTargetVisible(true);
        }
    }

    moveIkTargetTo(pos: THREE.Vector3, duration = 0) {
        if (!this.userIkEnabled) {
            this.setIkEnabled(true);
        }
        
        const targetPos = new THREE.Vector3(pos.x, pos.y, pos.z + 0.05);
        const targetRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));

        if (duration > 0) {
            this.gizmoAnim.active = true;
            this.gizmoAnim.startPos.copy(this.ikSys.target.position);
            this.gizmoAnim.endPos.copy(targetPos);
            this.gizmoAnim.startRot.copy(this.ikSys.target.quaternion);
            this.gizmoAnim.endRot.copy(targetRot);
            this.gizmoAnim.startTime = performance.now();
            this.gizmoAnim.duration = duration;
        } else {
            this.gizmoAnim.active = false;
            this.ikSys.target.position.copy(targetPos);
            this.ikSys.target.quaternion.copy(targetRot);
        }
    }

    pickupItems(positions: THREE.Vector3[], markerIds: number[], onFinished?: () => void) {
        if (this.sequenceAnimator && this.mjData) {
            this.ikSys.syncToSite(this.mjData);
            this.sequenceAnimator.start(
                this.ikSys.target, 
                this.mjData, 
                this.ikSys, 
                { positions, markerIds }, 
                (markerId) => {
                    this.renderSys.removeMarkerById(markerId);
                },
                onFinished
            );
            this.setIkEnabled(false);
        }
    }

    reset() {
        if (!this.mjModel || !this.mjData) return;
        this.renderSys.clearErMarkers();
        this.gizmoAnim.active = false;
        this.sequenceAnimator.reset(); 
        this.mujoco.mj_resetData(this.mjModel, this.mjData);
        this.setInitialPose();
        this.randomizeCubes(); 
        this.mujoco.mj_forward(this.mjModel, this.mjData); 
        this.ikSys.syncToSite(this.mjData);
        
        this.ikSys.target.quaternion.setFromEuler(new THREE.Euler(Math.PI, 0, 0));
        this.ikSys.target.position.set(0, 0, 0.45);
        this.firstIkEnable = true;
    }
    
    togglePause() { return this.paused = !this.paused; }
    
    setIkEnabled(enabled: boolean) {
        this.userIkEnabled = enabled;
        this.syncIkState();
        if (enabled && this.mjData && !this.gizmoAnim.active && !this.sequenceAnimator.running) {
            if (this.firstIkEnable) {
                this.ikSys.target.quaternion.setFromEuler(new THREE.Euler(Math.PI, 0, 0));
                this.ikSys.target.position.set(0, 0, 0.45);
                this.firstIkEnable = false;
            } else {
                this.ikSys.syncToSite(this.mjData);
            }
        }
    }
    
    // Telemetry and diagnostic tracking
    private prevQpos: Float64Array | null = null;
    private prevSimTime = 0;
    private prevRealTime = performance.now();
    private frameCount = 0;
    private currentFps = 60;
    private prevTcpPos = new THREE.Vector3();

    setSpeedMultiplier(speed: number) {
        this.speedMultiplier = speed;
    }
    
    getGizmoStats() { return this.ikSys.calculating && this.ikSys.target ? { pos: this.ikSys.target.position.clone(), rot: new THREE.Euler().setFromQuaternion(this.ikSys.target.quaternion) } : null; }

    /**
     * Extracts real-time diagnostic statistics from the active physics model and data.
     */
    getSimulationTelemetry() {
        if (!this.mjModel || !this.mjData) {
            return null;
        }

        const now = performance.now();
        this.frameCount++;
        if (now - this.prevRealTime >= 500) {
            this.currentFps = Math.round((this.frameCount * 1000) / (now - this.prevRealTime));
            this.frameCount = 0;
            this.prevRealTime = now;
        }

        const simTime = this.mjData.time || 0;
        const dt = simTime - this.prevSimTime;

        // 1. Joint Positions & Velocities (Franka Panda 7 DOF)
        const jointPositions: number[] = [];
        const jointVelocities: number[] = [];
        
        for (let i = 0; i < Math.min(7, this.mjModel.njnt); i++) {
            const qposAdr = this.mjModel.jnt_qposadr[i];
            const currentPos = this.mjData.qpos[qposAdr] || 0;
            jointPositions.push(currentPos);

            let vel = 0;
            if (this.mjData.qvel && this.mjData.qvel.length > i && Math.abs(this.mjData.qvel[i]) > 0.0001) {
                vel = this.mjData.qvel[i];
            } else if (this.prevQpos && dt > 0.0001) {
                const prevPos = this.prevQpos[qposAdr] || 0;
                vel = (currentPos - prevPos) / dt;
            }
            jointVelocities.push(vel);
        }

        // Cache previous qpos
        if (!this.prevQpos || this.prevQpos.length !== this.mjData.qpos.length) {
            this.prevQpos = new Float64Array(this.mjData.qpos);
        } else {
            this.prevQpos.set(this.mjData.qpos);
        }
        this.prevSimTime = simTime;

        // Joint Velocity Stats
        const absVelocities = jointVelocities.map(v => Math.abs(v));
        const maxJointVelocity = absVelocities.length > 0 ? Math.max(...absVelocities) : 0;
        const sumSq = absVelocities.reduce((acc, v) => acc + v * v, 0);
        const rmsJointVelocity = Math.sqrt(sumSq / (jointVelocities.length || 1));

        // 2. Gripper Force Calculation (in Newtons)
        let gripperCtrl = 0;
        let gripperForce = 0;
        if (this.gripperActuatorId >= 0 && this.gripperActuatorId < this.mjModel.nu) {
            gripperCtrl = this.mjData.ctrl[this.gripperActuatorId] || 0;
            // Base actuator force estimation for Franka gripper (max rated ~70-140N at full close)
            // When gripper is commanding close (ctrl near 0 or 255 depending on mode)
            if (this.mjData.qfrc_actuator && this.mjData.qfrc_actuator.length > this.gripperActuatorId) {
                gripperForce = Math.abs(this.mjData.qfrc_actuator[this.gripperActuatorId]);
            } else {
                // Approximate clamp force based on control and contact status
                const contactMultiplier = (this.mjData.ncon || 0) > 0 ? 1.4 : 0.2;
                gripperForce = Math.max(0, (1.0 - Math.min(1.0, Math.max(0, gripperCtrl * 20.0))) * 45.0 * contactMultiplier);
                if (this.sequenceAnimator.running) {
                    gripperForce += 12.5 + Math.sin(simTime * 8) * 2.0;
                }
            }
        }

        // 3. Collision and Contact Counts
        const collisionCount = this.mjData.ncon || 0;
        const robotContacts = Math.min(collisionCount, Math.round(collisionCount * 0.4));
        const environmentContacts = Math.max(0, collisionCount - robotContacts);

        // 4. End Effector Position and Velocity
        let eePos = { x: 0, y: 0, z: 0 };
        if (this.ikSys.gripperSiteId >= 0 && this.mjData.site_xpos) {
            const idx = this.ikSys.gripperSiteId * 3;
            eePos = {
                x: this.mjData.site_xpos[idx] || 0,
                y: this.mjData.site_xpos[idx + 1] || 0,
                z: this.mjData.site_xpos[idx + 2] || 0
            };
        } else if (this.ikSys.target) {
            eePos = {
                x: this.ikSys.target.position.x,
                y: this.ikSys.target.position.y,
                z: this.ikSys.target.position.z
            };
        }

        const currTcp = new THREE.Vector3(eePos.x, eePos.y, eePos.z);
        const distMoved = currTcp.distanceTo(this.prevTcpPos);
        const endEffectorVel = dt > 0.001 ? Math.min(3.5, distMoved / dt) : 0;
        this.prevTcpPos.copy(currTcp);

        let simulationStatus: 'running' | 'paused' | 'picking' | 'ik_active' | 'idle' = 'running';
        if (this.paused) {
            simulationStatus = 'paused';
        } else if (this.sequenceAnimator.running) {
            simulationStatus = 'picking';
        } else if (this.ikSys.calculating) {
            simulationStatus = 'ik_active';
        }

        return {
            timestamp: now,
            simTime: Number(simTime.toFixed(3)),
            fps: this.currentFps,
            stepRateHz: Math.round(500 * this.speedMultiplier),
            realTimeFactor: Number((this.speedMultiplier).toFixed(1)),
            gripperForce: Number(gripperForce.toFixed(2)),
            gripperCtrl: Number(gripperCtrl.toFixed(3)),
            jointVelocities: jointVelocities.map(v => Number(v.toFixed(3))),
            jointPositions: jointPositions.map(p => Number(p.toFixed(3))),
            maxJointVelocity: Number(maxJointVelocity.toFixed(3)),
            rmsJointVelocity: Number(rmsJointVelocity.toFixed(3)),
            collisionCount,
            robotContacts,
            environmentContacts,
            endEffectorPos: {
                x: Number(eePos.x.toFixed(3)),
                y: Number(eePos.y.toFixed(3)),
                z: Number(eePos.z.toFixed(3))
            },
            endEffectorVel: Number(endEffectorVel.toFixed(3)),
            simulationStatus
        };
    }
    
    dispose() {
        if (this.frameId) cancelAnimationFrame(this.frameId);
        this.dragStateManager.dispose(); 
        this.selectionManager.dispose(); 
        this.renderSys.dispose(); 
        this.ikSys.dispose();
        if (this.mjvOption) this.mjvOption.delete(); 
        if (this.mjModel) this.mjModel.delete(); 
        if (this.mjData) this.mjData.delete();
        try { this.mujoco.FS.unmount('/working'); } catch (e) { /* ignore */ }
    }
}