module.exports = function(ws){
    function on_pong(){
        ws._life = 30000;
    }

    var ping_handle = null;
    function ping(){
        ws.ping(function(){});
        if(ws._life !== undefined) ws._life -= 10000;
        if(ws._life < 0){
            ws.terminate();
            if(null !== ping_handle) clearTimeout(ping_handle);
        } else {
            ping_handle = setTimeout(ping, 10000);
        }
    }
    
    on_pong(); ping();
    ws.on("pong", on_pong);

    ws.on("close", function(){
        console.log("WS close");
        setTimeout(() => ws.removeAllListeners(), 10);
    });
}
