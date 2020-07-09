const net = require("net");
const events = require("events");
const cipher = require("./cipher");



async function readbytes(connection, count){
    var got = 0;
    const chunks = [];
    while(got < count){
        let chunk = connection.read(count - got);
        if(chunk === null){
            await new Promise((resolve, reject) => {
                connection.once("readable", resolve);
                connection.once("error", reject);
            });
        } else {
            got += count;
            chunks.push(chunk);
        }
    }
    return Buffer.concat(chunks);
}

function writebytes(connection, bytes){
    return new Promise((resolve, reject) => {
        connection.write(Buffer.from(bytes), resolve);
    });
}


async function readaddrport(connection, atyp){
    if(atyp == 0x03){
        let length = (await readbytes(connection, 1))[0];
        let addr = await readbytes(connection, length);
        let port = await readbytes(connection, 2);
        addr = addr.toString("ascii");
        port = (port[0] << 8) | port[1];
        return [addr, port];
    }
    if(atyp == 0x01){
        let chunk = await readbytes(connection, 6);
        let addr = [
            chunk[0].toString(),
            chunk[1].toString(),
            chunk[2].toString(),
            chunk[3].toString(),
        ].join(".");
        let port = (chunk[4] << 8) | chunk[5];
        return [addr, port];
    }
    throw Error("IPv6 not supported");
}

function readaddrportdata(buffer, atyp){
    if(atyp == 0x03){
        let length = buffer[0];
        let addr = buffer.slice(1, 1+length);
        let port = buffer.slice(1+length, 3+length);
        addr = addr.toString("ascii");
        port = (port[0] << 8) | port[1];
        return [addr, port, buffer.slice(3+length)];
    }
    if(atyp == 0x01){
        let chunk = buffer.slice(0, 6);
        let addr = [
            chunk[0].toString(),
            chunk[1].toString(),
            chunk[2].toString(),
            chunk[3].toString(),
        ].join(".");
        let port = (chunk[4] << 8) | chunk[5];
        return [addr, port, buffer.slice(6)];
    }
    throw Error("IPv6 not supported");
}

function writeaddrport(ip, port){
    const ipval = ip.split(".").map((e) => parseInt(e));
    ipval.push((port & 0xFF00) >> 8);
    ipval.push(port & 0xFF);
    return new Uint8Array(ipval);
}


/**
 * A dummy UDP socket emitted by UDPSocks5 server. 
 */
class UDPSocket extends events.EventEmitter{

    constructor(tcp_connection, udp_socket, srcaddrport){
        super();
        const self = this;

        if(false === srcaddrport){
            this.src_undecided = true;
        } else {
            [this.srcaddr, this.srcport] = srcaddrport;
        }

        cipher.allocate_client_socket_id(this);

        this.tcp_connection = tcp_connection;
        this.udp_socket = udp_socket;

        this.udp_socket.on("message", (m,r) => self.on_udp_message(m,r));
        this.tcp_connection.on("close", () => self.on_close());
    }

    send(msg){
        if(this.src_undecided) return;

        this.udp_socket.send(msg, 0, msg.length, this.srcport, this.srcaddr, () => {
            console.log("UDP to local client:" + msg.length + " bytes written.");
        });
    }

    on_udp_message(msg, rinfo){
        if(!(msg[0] == 0x00 && msg[1] == 0x00)) return; // RSV == 0x0000
        if(this.src_undecided){
            // the first valid communication on this socket is remembered
            this.srcaddr = rinfo.address;
            this.srcport = rinfo.port;
            this.src_undecided = false;
        }

        if(msg[2] != 0x00) return; // FRAG == 0x00, ignore fragmentation
        let atyp = msg[3];
        let [dstaddr, dstport, data] = readaddrportdata(msg.slice(4), atyp);
        let [srcaddr, srcport] = [rinfo.address, rinfo.port];
        this.emit("message", {
            // to Internet remote server
            dstaddr, dstport, data
        });
        console.log("Local client @ " + srcaddr + ":" + srcport + " to UDP:" + data.length + " bytes read.");
    }
    
    on_close(){
        this.emit("close");
        this.udp_socket.removeAllListeners();
        this.tcp_connection.removeAllListeners();
        console.log("Local Port [" + this.id.string + "] closed.");
    }


}



/**
 * A partial SOCKS5 server, with only UDP associate implemented.
 */
class UDPSocks5 extends events.EventEmitter{

    constructor(port){
        super();
        const self = this;
        
        this.socks5_socket = net.createServer(
            (c) => self.on_connection(self, c));
        this.socks5_socket.listen(port);
        
    }


    async on_connection(self, connection){

        function assert(v, e){
            if(!v){
                connection.destroy();
                throw Error(e);
            }
        }



        {
            let chunk = await readbytes(connection, 2);
            let version = chunk[0];
            assert(version == 0x05, "Invalid request.");

            let nmethods = chunk[1];

            let methods = await readbytes(connection, nmethods);
            console.log("methods", methods);
        }

        await writebytes(connection, [0x05, 0x00]); // no auth required


        let srcaddr, srcport;
        // UDP assocate: client sends addr+port that it's going to use

        {
            let chunk = await readbytes(connection, 4);
            let version = chunk[0];
            let cmd = chunk[1];
            let rsv = chunk[2];
            let atyp = chunk[3];

            assert(version == 0x05 && rsv == 0x00, "Invalid request.");
            assert(cmd == 0x03, "Not UDP associate request.");
        
            [srcaddr, srcport] = await readaddrport(connection, atyp);
        }

        let src_undecided = (srcaddr == "0.0.0.0" && srcport == 0);

        // accept UDP associate
        
        const udp_socket = require("dgram").createSocket("udp4"); 
        await new Promise((resolve, reject) => udp_socket.bind(resolve));

        let local_udp_address = udp_socket.address();
        console.log("NEW UDP SOCKET:", local_udp_address);

        await writebytes(
            connection,
            Buffer.concat([
                new Uint8Array([
                    0x05, // ver
                    0x00, // succeed
                    0x00, // RSV
                    0x01, // ipv4
                ]),
                writeaddrport(
                    local_udp_address.address,
                    local_udp_address.port
                )
            ])
        );

        
        const socket = new UDPSocket(
            connection, udp_socket,
            (src_undecided ? false : [srcaddr, srcport])
        );
        self.emit("socket", socket);
    }

}

module.exports = UDPSocks5;
