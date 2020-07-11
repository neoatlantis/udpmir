const events = require("events");

const BUFFER_SIZE = 256;
const SEQUENCE_SIZE_MAX = 1024;



class TCPRecvBuffer extends events.EventEmitter {
    
    constructor (){
        super();
        this.reset();
    }

    reset(){
        this.sequences = [];
        this.sequences_length = new Uint16Array(BUFFER_SIZE);
        for(let i=0; i<BUFFER_SIZE; i++){
            // Each sequence: 1 byte for non-empty mark, 2 bytes for length,
            // the rest for data
            this.sequences.push(new Uint8Array(SEQUENCE_SIZE_MAX));
        }


        this.read_pointer = 0;

        // the seq that this.sequences[this.read_pointer] corresponds to.
        this.sequence_id = 0;

        this.sequence_stop_at = -1;
        this.stopped = false;
    }

    /**
     * Write a packet to circular buffer. Returns the sequence id that should
     * be the next (which is also the count of acknowledged sequences).
     *
     */
    write (sequence_id, packet){
        if(this.stopped) return;
        let offset_after_pointer = sequence_id - this.sequence_id;
        if(
            offset_after_pointer > BUFFER_SIZE ||
            packet.length > SEQUENCE_SIZE_MAX
        ){
            return this.sequence_id;
        }

        let write_i = (offset_after_pointer + this.read_pointer) % BUFFER_SIZE;

        this.sequences_length[write_i] = packet.length;
        this.sequences[write_i].set(packet, 0);

        // emit all consequent sequences and move on
        return this.flush(); // == this.sequence_id, next expected id
    }

    /**
     * Records a stop signal. The stream is stopped when "write" reaches or
     * exceeds this sequence id. When calling this method, the sequence_id
     * must be bigger than this.sequence_id
     */
    stop (sequence_id){
        if(sequence_id < this.sequence_id) return false;
        this.sequence_stop_at = sequence_id;
        this.flush();
        return true;
    }

    flush(){
        while(true){
            let emitted = this._advance_read_pointer();
            if(emitted === false) break;
            this.emit("message", emitted);
        }
        if(
            this.sequence_stop_at >= 0 &&
            this.sequence_id >= this.sequence_stop_at
        ){
            this.emit("closed");
            this.stopped = true;
        }
        return this.sequence_id;
    }

    _advance_read_pointer(){
        let seqlength = this.sequences_length[this.read_pointer];
        if(0 == seqlength) return false;
        let oldval = this.read_pointer;
        let newval = (this.read_pointer + 1) % BUFFER_SIZE;
        this.sequences_length[oldval] = 0;
        this.read_pointer = newval;
        this.sequence_id++;
        return Buffer.from(this.sequences[oldval].slice(0, seqlength));
    }

}


/**
 * A TCP to packets converter.
 * 2 events should be handled by any code using this class:
 * (a) message, with argument sequence_id, data: this is the outgoing new
 *     packet.
 * (b) stop, with argument sequence_id: this is like the FIN packet
 */

class TCPSendBuffer extends events.EventEmitter {
    
    constructor (){
        super();
        this.reset();
    }

    reset(){
        this.sequences = [];
        this.sequences_id = new Uint32Array(BUFFER_SIZE);
        this.sequences_length = new Uint16Array(BUFFER_SIZE);
        for(let i=0; i<BUFFER_SIZE; i++){
            this.sequences.append(new Uint8Array(SEQUENCE_SIZE_MAX));
        }

    }

    write(data){    
        
    }

    acknowledge(sequence_id){
    }

}



x = new TCPRecvBuffer();

x.on("message", (x) => console.log(Buffer.from(x).toString()));
x.on("closed", () => console.log("closed"));


x.write(3, new Uint8Array(Buffer.from("3")));
x.write(1, new Uint8Array(Buffer.from("1")));
x.write(0, new Uint8Array(Buffer.from("0")));
x.write(2, new Uint8Array(Buffer.from("2")));

x.write(4, new Uint8Array(Buffer.from("4")));
x.write(8, new Uint8Array(Buffer.from("8")));
x.write(5, new Uint8Array(Buffer.from("5")));
x.write(9, new Uint8Array(Buffer.from("9")));
x.write(7, new Uint8Array(Buffer.from("7")));
x.write(6, new Uint8Array(Buffer.from("6")));
