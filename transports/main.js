(function(){
//////////////////////////////////////////////////////////////////////////////

function random_pick_from_obj(obj){
    const keys = Object.keys(obj);
    if(keys.length < 1) return null;
    const key = keys[Math.floor(Math.random() * keys.length)];
    return obj[key];
}

// ---------------------------------------------------------------------------

const local_sockets = {};
const remote_sockets = {};

async function on_local_message(e){
    const buffer = await e.data.arrayBuffer();
    const target = random_pick_from_obj(remote_sockets);
    if(!target) return;
    target.send(buffer);
}

async function on_remote_message(e){
    const buffer = await e.data.arrayBuffer();
    const target = random_pick_from_obj(local_sockets);
    if(!target) return;
    target.send(buffer);
}


function set_up_websocket(url, group){
    const ws = new WebSocket(url);

    ws.onmessage = ("local" == group ? on_local_message : on_remote_message);
    ("local" == group ? local_sockets : remote_sockets)[url] = ws;

    ws.onopen = () => console.log(group + " ws open");
    ws.onclose = () => {
        console.log("ws closed. reconnect.");
        setTimeout(() => set_up_websocket(url, group), 1000);
    };
}




function main(){

    set_up_websocket("ws://localhost:18964", "local");

    set_up_websocket("ws://localhost:6489/1", "remote");
    set_up_websocket("ws://localhost:6489/2", "remote");
    
}
$(main);

//////////////////////////////////////////////////////////////////////////////
})();
