// DRACOLoader 完整集成方案

// 确保在页面加载完成后执行
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupDracoIntegration);
    } else {
        setupDracoIntegration();
    }
}

function setupDracoIntegration() {
    console.log('开始设置DRACOLoader集成');
    
    // 动态加载DRACOLoader所需的脚本
    loadDracoScripts(function() {
        console.log('DRACOLoader脚本加载完成');
        
        // 监听GLTFLoader的创建，自动为其添加DRACOLoader支持
        hookGLTFLoaderCreation();
        
        // 为已存在的GLTFLoader实例添加支持
        enhanceExistingGLTFLoaders();
        
        console.log('DRACOLoader集成设置完成');
    });
}

function loadDracoScripts(callback) {
    // 检查是否已加载
    if (typeof DRACOLoader !== 'undefined' || (typeof THREE !== 'undefined' && typeof THREE.DRACOLoader !== 'undefined')) {
        callback();
        return;
    }
    
    var loadedCount = 0;
    var totalScripts = 2;
    
    function onScriptLoad() {
        loadedCount++;
        if (loadedCount === totalScripts) {
            callback();
        }
    }
    
    // 加载DRACOLoader.js
    loadScript('https://ssm-smart.github.io/axure/three/DRACOLoader.js', onScriptLoad);
    
    // 加载draco_decoder.js
    loadScript('https://ssm-smart.github.io/axure/three/draco_decoder.js', onScriptLoad);
}

function loadScript(src, onload) {
    var script = document.createElement('script');
    script.src = src;
    script.onload = onload;
    script.onerror = function() {
        console.error('无法加载脚本:', src);
    };
    document.head.appendChild(script);
}

function hookGLTFLoaderCreation() {
    // 尝试钩住GLTFLoader构造函数
    if (typeof THREE !== 'undefined' && typeof THREE.GLTFLoader === 'function') {
        var originalConstructor = THREE.GLTFLoader;
        THREE.GLTFLoader = function() {
            // 正确的构造函数调用方式
            var loader = new originalConstructor(...arguments);
            applyDracoSupport(loader);
            return loader;
        };
        // 继承原型
        THREE.GLTFLoader.prototype = originalConstructor.prototype;
    }
    
    // 也钩住全局的GLTFLoader
    if (typeof window !== 'undefined' && typeof window.GLTFLoader === 'function') {
        var originalGLTFLoader = window.GLTFLoader;
        window.GLTFLoader = function() {
            // 正确的构造函数调用方式
            var loader = new originalGLTFLoader(...arguments);
            applyDracoSupport(loader);
            return loader;
        };
        window.GLTFLoader.prototype = originalGLTFLoader.prototype;
    }
}

function enhanceExistingGLTFLoaders() {
    // 检查全局对象中是否有GLTFLoader实例
    for (var key in window) {
        if (window.hasOwnProperty(key)) {
            var obj = window[key];
            if (obj && typeof obj === 'object' && typeof obj.load === 'function' && 
                (obj.constructor.name === 'GLTFLoader' || 
                 (typeof obj.setDRACOLoader === 'function'))) {
                applyDracoSupport(obj);
            }
        }
    }
}

function applyDracoSupport(gltfLoader) {
    if (!gltfLoader || typeof gltfLoader.setDRACOLoader !== 'function') {
        return;
    }
    
    // 获取DRACOLoader构造函数
    var DRACOCtor = null;
    if (typeof THREE !== 'undefined' && typeof THREE.DRACOLoader !== 'undefined') {
        DRACOCtor = THREE.DRACOLoader;
    } else if (typeof window !== 'undefined' && typeof window.DRACOLoader !== 'undefined') {
        DRACOCtor = window.DRACOLoader;
    }
    
    if (DRACOCtor) {
        try {
            var dracoLoader = new DRACOCtor();
            // 设置解码器路径，指向CDN地址
            dracoLoader.setDecoderPath('https://ssm-smart.github.io/axure/three/');
            gltfLoader.setDRACOLoader(dracoLoader);
            console.log('已为GLTFLoader实例添加DRACOLoader支持');
        } catch (error) {
            console.error('创建DRACOLoader时出错:', error);
        }
    }
}

// 提供公共API
globalThis.DracoIntegration = {
    setup: setupDracoIntegration,
    createDracoLoader: function() {
        var DRACOCtor = null;
        if (typeof THREE !== 'undefined' && typeof THREE.DRACOLoader !== 'undefined') {
            DRACOCtor = THREE.DRACOLoader;
        } else if (typeof window !== 'undefined' && typeof window.DRACOLoader !== 'undefined') {
            DRACOCtor = window.DRACOLoader;
        }
        
        if (DRACOCtor) {
            var dracoLoader = new DRACOCtor();
            dracoLoader.setDecoderPath('https://ssm-smart.github.io/axure/three/');
            return dracoLoader;
        }
        return null;
    },
    applyToLoader: applyDracoSupport
};