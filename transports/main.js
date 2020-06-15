(function(){
//////////////////////////////////////////////////////////////////////////////
const local_sockets = {};
const remote_sockets = {};

async function on_local_message(e){
    console.log(await e.data.arrayBuffer());
}

async function on_remote_message(e){
    console.log(e);
}


function set_up_websocket(url, group){
    const ws = new WebSocket(url);

    ws.onmessage = ("local" == group ? on_local_message : on_remote_message);
    ("local" == group ? local_sockets : remote_sockets)[url] = ws;

    ws.onopen = () => console.log("ws open");
}




function main(){

    set_up_websocket("ws://localhost:18964", "local");

    
}
$(main);

//////////////////////////////////////////////////////////////////////////////
})();
