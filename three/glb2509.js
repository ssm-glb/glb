// glb2509.js
// Helper for loading glb/gltf with support for Draco-compressed meshes (Blender export)
// Usage: include this script after three.js and GLTFLoader.js in your page.
// Call: GLBLoaderHelper.load(urlOrConfig).then(gltf => { ... })

(function(global){
    'use strict';

    // Default configuration
    const DEFAULTS = {
        url: '',
        autoRotate: false,
        autoRotateSpeed: 2,
        cameraPosition: null,
        backgroundColor: '#000000',
        enableShadows: false,
        modelScale: 1,
        dracoPath: './libs/three/', // where draco_decoder.js / draco_wasm_wrapper.js / draco_decoder.wasm live
        meshoptDecoderPath: null // optional path to meshopt_decoder.js if used
    };

    function mergeConfig(user){
        const cfg = Object.assign({}, DEFAULTS, user || {});
        // normalize cameraPosition
        if (Array.isArray(cfg.cameraPosition) && cfg.cameraPosition.length === 3) {
            cfg.cameraPosition = cfg.cameraPosition.map(Number);
        } else {
            cfg.cameraPosition = null;
        }
        return cfg;
    }

    function createGLTFLoader(cfg){
        if (!global.THREE || !global.THREE.GLTFLoader) {
            throw new Error('THREE or GLTFLoader not found. Include three.js and GLTFLoader.js first.');
        }

        const loader = new global.THREE.GLTFLoader();

        // Setup DRACOLoader if available
        try {
            if (global.THREE.DRACOLoader) {
                const dracoLoader = new global.THREE.DRACOLoader();
                dracoLoader.setDecoderPath(cfg.dracoPath);
                // three's DRACOLoader will fetch draco_decoder.js / draco_wasm_wrapper.js / draco_decoder.wasm
                loader.setDRACOLoader(dracoLoader);
            }
        } catch (e) {
            // ignore if DRACOLoader not available
            console.warn('DRACOLoader init failed:', e && e.message);
        }

        // Optional: meshopt decoder
        if (cfg.meshoptDecoderPath && loader.setMeshoptDecoder) {
            try {
                // setMeshoptDecoder expects a decode function; modern three accepts a path string to load
                loader.setMeshoptDecoder(cfg.meshoptDecoderPath);
            } catch (e) {
                console.warn('meshopt setup failed:', e && e.message);
            }
        }

        return loader;
    }

    function load(urlOrConfig){
        const cfg = mergeConfig(typeof urlOrConfig === 'string' ? { url: urlOrConfig } : (urlOrConfig || {}));
        return new Promise(function(resolve, reject){
            if (!cfg.url) return reject(new Error('No url specified'));

            let loader;
            try {
                loader = createGLTFLoader(cfg);
            } catch (e) {
                return reject(e);
            }

            loader.load(cfg.url,
                function(gltf){
                    try {
                        // apply scale if needed
                        if (cfg.modelScale && cfg.modelScale !== 1) {
                            gltf.scene.scale.setScalar(cfg.modelScale);
                        }
                        resolve({ gltf: gltf, config: cfg });
                    } catch (e) {
                        reject(e);
                    }
                },
                function(progress){
                    // progress can be handled by caller by attaching loader manager; simple console log
                    // console.log('gltf progress', progress);
                },
                function(err){
                    reject(err || new Error('GLTF load error'));
                }
            );
        });
    }

    // Expose helper
    global.GLBLoaderHelper = {
        DEFAULTS: DEFAULTS,
        mergeConfig: mergeConfig,
        createGLTFLoader: createGLTFLoader,
        load: load
    };

})(window || this);
