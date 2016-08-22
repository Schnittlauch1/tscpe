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

'use strict';

import fs = require('fs');

import {Z80Cpu} from './hardware/arch/z80';
import {IoPort} from './hardware/io-port';
import {IoBus} from './hardware/io-bus';
import {operations} from './hardware/arch/z80-operations';
import {Instruction} from './hardware/arch/instruction';
import {Operand} from './hardware/arch/instruction';

import {Ram} from './hardware/ram';

require('source-map-support').install();


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
  private latch: boolean = false;

  public read(): number {
    switch(cpu.reg.C.value()) {
      case 2:
        this.charBuff[0] = cpu.reg.E.value();
        process.stdout.write(this.charBuff);
        /*if(this.charBuff[0] === 10) {
          if(this.latch) {
            this.stopEmulation = true;
            process.exit(0);
          }
          this.latch = true;
        }*/
        break;

      case 9:
        let i=cpu.reg.DE.value();
        let c=0;
        while(ram.readMemory(i) != 0x24) {
          this.charBuff[0] = ram.readMemory(i);
          process.stdout.write(this.charBuff);
          i++;
          c++;

          if(c >= 100) { this.stopEmulation = true; }
          
          /*if(this.charBuff[0] === 10) {
            if(this.latch) {
              this.stopEmulation = true;
              process.exit(0);
            }
            this.latch = true;
          }*/
        }
        break;

      default:
        console.log('Unknown call', cpu.reg.C.value());
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

const testProg = fs.readFileSync('test/zexdoc.com');
for(let i=0; i < testProg.length; i++) {
  ram.writeMemory(0x100 + i, testProg[i]);
}

cpu.reg.PC.setValue(0x100);

let cycles=0;

/* let cpsInterval = setInterval(() => {
  console.log('CPS:', cycles);
  cycles = 0;
}, 1000);*/

process.stdout.write("Starting emulation...\n");

function runEmulation() {
  while(!emulationDevice.stopEmulation) {
    cpu.tick(1);
  } 
}

runEmulation();

process.stdout.write("Emulation finished...\n");
