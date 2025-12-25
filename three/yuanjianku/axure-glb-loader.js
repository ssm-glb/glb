(function(){
    function loadScript(url, cb){
        var s = document.createElement('script');
        s.src = url;
        s.onload = cb;
        document.head.appendChild(s);
    }
    loadScript('https://ssm-smart.github.io/axure/three/three.min.js', function(){
    loadScript('https://ssm-smart.github.io/axure/three/GLTFLoader.js', function(){
    loadScript('https://ssm-smart.github.io/axure/three/DRACOLoader.js', function(){
    loadScript('https://ssm-smart.github.io/axure/three/OrbitControls.js', function(){
    loadScript('https://ssm-smart.github.io/axure/three/PointerLockControls.js', function(){
    loadScript('https://ssm-smart.github.io/axure/three/tween.umd.min.js', function(){
    loadScript('https://ssm-smart.github.io/axure/three/yuanjianku/glb.js', function(){
        var container = $("[data-label='my3dviewer']")[0];
        var config = typeof window.config !== 'undefined' ? window.config : {};
        var dataSets = typeof window.dataSets !== 'undefined' ? window.dataSets : {};
        console.log('config:', typeof config, config);
        console.log('dataSets:', typeof dataSets, dataSets);
        if (container && window.AxhubGLBViewer && window.AxhubGLBViewer.render) {
            window.AxhubGLBViewer.render(
                container,
                dataSets,
                config,
                function(event, payload){
                    // 事件回调
                }
            );
        } else {
            alert('glb.js未加载或容器未找到');
        }
    });});});});});});});
})();