/**
 * public/modules/animationEngine.js
 * Premium Animation Engine Master Coordinator
 *
 * Orchestrates 7 Animation Components:
 *  1. Liquid Blob
 *  2. Energy Ring
 *  3. Particle System
 *  4. Neural Network
 *  5. Dynamic Background
 *  6. Audio Equalizer
 *  7. Voice Bubble
 *
 * STRICT REQUIREMENT:
 *  - No animation controls AI logic.
 *  - All components respond ONLY to Event Bus state emissions (Listening, Thinking, Reasoning, Speaking, Finished, Interrupted).
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([
            './eventBus',
            './liquidBlob',
            './energyRing',
            './floatingParticles',
            './neuralNetwork',
            './dynamicBackground',
            './audioEqualizer',
            './voiceBubble'
        ], factory);
    } else if (typeof module === 'object' && module.exports) {
        const eventBus = require('./eventBus');
        const liquidBlob = require('./liquidBlob');
        const energyRing = require('./energyRing');
        const floatingParticles = require('./floatingParticles');
        const neuralNetwork = require('./neuralNetwork');
        const dynamicBackground = require('./dynamicBackground');
        const audioEqualizer = require('./audioEqualizer');
        const voiceBubble = require('./voiceBubble');
        module.exports = factory(
            eventBus, liquidBlob, energyRing, floatingParticles,
            neuralNetwork, dynamicBackground, audioEqualizer, voiceBubble
        );
    } else {
        root.animationEngine = factory(
            root.eventBus, root.liquidBlob, root.energyRing, root.floatingParticles,
            root.neuralNetwork, root.dynamicBackground, root.audioEqualizer, root.voiceBubble
        );
    }
}(typeof self !== 'undefined' ? self : this, function (
    eventBus, liquidBlob, energyRing, floatingParticles,
    neuralNetwork, dynamicBackground, audioEqualizer, voiceBubble
) {

    class AnimationEngine {
        constructor(bus = eventBus) {
            this.bus = bus;
            this.components = {
                liquidBlob,
                energyRing,
                floatingParticles,
                neuralNetwork,
                dynamicBackground,
                audioEqualizer,
                voiceBubble
            };
            this.currentState = 'Ready';

            this._setupEventSubscriptions();
        }

        _setupEventSubscriptions() {
            if (this.bus) {
                this.bus.on('state:changed', (record) => {
                    this.currentState = record.currentState || 'Ready';
                });
            }
        }

        attachAll({ waveCanvas, particlesCanvas, networkCanvas, eqCanvas, energyRingEl, orbEl, containerEl }) {
            if (waveCanvas && this.components.liquidBlob) {
                this.components.liquidBlob.attachCanvas(waveCanvas);
            }
            if (particlesCanvas && this.components.floatingParticles) {
                this.components.floatingParticles.attachCanvas(particlesCanvas);
            }
            if (networkCanvas && this.components.neuralNetwork) {
                this.components.neuralNetwork.attachCanvas(networkCanvas);
            }
            if (eqCanvas && this.components.audioEqualizer) {
                this.components.audioEqualizer.attachCanvas(eqCanvas);
            }
            if (energyRingEl && this.components.energyRing) {
                this.components.energyRing.attachElement(energyRingEl);
            }
            if (orbEl && this.components.voiceBubble) {
                this.components.voiceBubble.attachElement(orbEl);
            }
            if (containerEl && this.components.dynamicBackground) {
                this.components.dynamicBackground.attachElement(containerEl);
            }
        }
    }

    const defaultInstance = new AnimationEngine(eventBus);
    defaultInstance.AnimationEngine = AnimationEngine;

    return defaultInstance;
}));
