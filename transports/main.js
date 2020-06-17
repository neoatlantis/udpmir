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

async function websocket_token(websocket, key=new Uint8Array([0,0,0,0])){
    const token = new Uint8Array(52);

    const t = Math.floor(new Date().getTime() / 30000);
    const nonce = new Uint8Array(20);
    window.crypto.getRandomValues(nonce);
    const timeslice = new Uint8Array(new Uint32Array([t]).buffer);
    nonce.set(timeslice, 0);
    token.set(nonce, 0);

    const hmac = sha256.hmac.create(key);
    hmac.update(nonce);
    const signature = new Uint8Array(hmac.arrayBuffer());
    token.set(signature, 20);

    websocket.send(token);
}

function set_up_websocket(url, group){
    const ws = new WebSocket(url);

    ws.onmessage = ("local" == group ? on_local_message : on_remote_message);
    ("local" == group ? local_sockets : remote_sockets)[url] = ws;

    ws.onopen = () => {
        setTimeout(()=>websocket_token(ws), 100);
        console.log(group + " ws open");
    };
    ws.onclose = () => {
        console.log("ws closed. reconnect.");
        setTimeout(() => set_up_websocket(url, group), 5000);
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
