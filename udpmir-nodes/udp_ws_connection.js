module.exports = function(udp, ws, options){
    if(!options) options = {};
    const filter = options.filter;
    const destination = options.destination;

    function on_udp_message(msg, rinfo){
        udp._last_rinfo = rinfo;
        ws.send(msg);
    }

    function on_ws_message(msg){
        if(!udp._last_rinfo) return;
        if(!filter(msg, udp._last_rinfo)) return;
        console.log('received: %s', msg);
        // if destination set, send packets to destination
        // otherwise, to 
    }

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
    udp.on("message", on_udp_message);
    ws.on("message", on_ws_message);
    ws.on("pong", on_pong);

    ws.on("close", function(){
        console.log("WS close");
        udp.removeListener("message", on_udp_message);
        ws.removeListener("message", on_ws_message);
        ws.removeListener("pong", on_pong);
    });

    console.log("WS open");
}
