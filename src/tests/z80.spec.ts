/*  TSEPC
    Copyright (C) 2016  Phil Lehmkuhl

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import chai = require('chai');
import {Z80Cpu} from '../hardware/arch/z80';
import {Ram} from '../hardware/ram';
import {IoPort} from '../hardware/io-port';
import {IoBus} from '../hardware/io-bus';

import fs = require('fs');
require('source-map-support').install();

chai.should();

class EmulationDevice extends IoPort {
  public stopEmulation: boolean = false;
  
  constructor() {
    super();
  }

  get value(): number { return undefined; }
  set value(val: number) { }
  
  public write(val: number) {
    this.stopEmulation = true;
  }
  
  private charBuff: Buffer = new Buffer(1);
  
  public read(): number {
    switch(cpu.reg.C.uint) {
      case 2:
        this.charBuff[0] = cpu.reg.E.uint;
        process.stdout.write(this.charBuff);
        break;
         
      case 9:
        let i=cpu.reg.DE.uint;
        let c=0;
        while(ram.readMemory(i) != 0x24) {
          this.charBuff[0] = ram.readMemory(i);
          process.stdout.write(this.charBuff);
          i++;
          c++;
          
          if(c >= 100) { this.stopEmulation = true; }
          c.should.be.lessThan(100);
        }
        break;
        
      default:
        console.log('Unknown call', cpu.reg.C.uint);
        break;
    }
    
    return undefined;
  }
};

let cpu: Z80Cpu;
const ioBus: IoBus = new IoBus();
const ram: Ram = new Ram(64 * 1024);
const emulationDevice = new EmulationDevice();

ioBus.connect(0x0000, 0x0, emulationDevice);

cpu = new Z80Cpu();
cpu.attachBus(ram);
cpu.attachIoBus(ioBus);

ram.writeMemory(0, 0xd3);
ram.writeMemory(1, 0x00);

ram.writeMemory(5, 0xdb);
ram.writeMemory(6, 0x00);
ram.writeMemory(7, 0xc9);

describe("Z80 Test Suite", function () {  
  it('Should execute zexdoc.com', function(done) {
    this.timeout(6 * 60 * 60 * 1000);
    
    const testProg = fs.readFileSync('test/zexdoc.com');
    for(let i=0; i < testProg.length; i++) {
      ram.writeMemory(0x100 + i, testProg[i]);
    }
    
    cpu.reg.PC.uint = 0x100;
    
    let cycles=0;
    
   /* let cpsInterval = setInterval(() => {
      console.log('CPS:', cycles);
      cycles = 0;
    }, 1000);*/
    
    process.stdout.write("Starting emulation...\n");
    function tick() {
      for(let i=0; i < 50000; i++) {
        cpu.tick(1);
        if(emulationDevice.stopEmulation) { break; }
      }
      
      if(emulationDevice.stopEmulation) {
        process.stdout.write("Emulation finished...\n");
        done();
      } else {
        process.nextTick(tick);
      }
    }
    
    process.nextTick(tick);
  });

});
