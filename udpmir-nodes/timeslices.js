/**
 * A clock generating and updating current time slices.
 */

const events = require("events");
const time_slices = {};


class Timeslice extends Uint8Array {

    constructor(value){
        const uint32 = new Uint32Array(1);
        super(uint32.buffer);
        this._uint32 = uint32;
        if(value){
            if(Number.isInteger(value)) 
                this.value = value;
            else
                this.buffer = value;
        }
    }

    get value(){
        return this._uint32[0];
    }

    set value(value){
        this._uint32[0] = value;
    }

    get buffer() {
        return Buffer.from(this);    
    }

    set buffer(value){
        this.set(value.slice(0, 4), 0);
    }

}



class Timeslices extends events.EventEmitter {
    
    constructor(period){
        super();

        const self = this;
        const ms = period * 1000;
        
        this.past = new Timeslice();
        this.current = new Timeslice();

        function update(forced){
            const old = self.current.value;

            self.current.value = Math.floor(new Date().getTime() / ms);
            self.past.value = self.current.value - 1;

            if(old != self.current.value || forced === true){
                setImmediate(function(){
                    self.emit("changed", {
                        past: new Timeslice(self.past.value),
                        current: new Timeslice(self.current.value),
                    });
                });
            }
        }

        setInterval(update, 5000);
        update(true);
    }

}




time_slices[30] = new Timeslices(30);
time_slices[300] = new Timeslices(300);

module.exports = time_slices;
module.exports.Timeslice = Timeslice;
